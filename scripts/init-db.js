/**
 * Database Initialization Script
 *
 * This script connects to the Postgres database using environment variables and
 * runs all .sql files found in the docker/postgres/ directory in alphabetical order.
 * The SQL files can contain template placeholders like {{ADMIN_USERNAME}}, which
 * are replaced with values from environment variables (.env) before execution.
 *
 * Usage:
 *   node scripts/init-db.js
 */

const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");

const SQL_DIR = path.resolve(__dirname, "..", "docker", "postgres"); // This path contains the SQL files to run
const MIGRATIONS_DIR = path.join(SQL_DIR, "migrations");

// SQL files use templates like {{ADMIN_USERNAME}}, which are replaced with these values. Doing so allows
// us to keep sensitive values in the .env file instead of in the SQL files.
const templateValues = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_FIRST_NAME: process.env.ADMIN_FIRST_NAME || "Admin",
    ADMIN_LAST_NAME: process.env.ADMIN_LAST_NAME || "User",
    PASSWORD_EXPIRATION_DAYS: process.env.PASSWORD_EXPIRATION_DAYS || "90",
    PASSWORD_MIN_LENGTH: process.env.PASSWORD_MIN_LENGTH || "8",
};

// If the admin email is not set in the .env file or environment, derive it from the username.
if (!templateValues.ADMIN_EMAIL && templateValues.ADMIN_USERNAME) {
    templateValues.ADMIN_EMAIL = `${templateValues.ADMIN_USERNAME}@finledger.local`;
}

// Simple literal escaping for SQL templates
function escapeLiteral(value) {
    return value.replace(/'/g, "''");
}

// Find and replace templates in the given SQL string
function applyTemplate(sql) {
    return sql.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
        const value = templateValues[key];
        if (value === undefined || value === null || value === "") {
            throw new Error(`Missing template value for ${key}`);
        }
        return escapeLiteral(String(value));
    });
}

// Create a new Postgres client using environment variables. Sane defaults are provided.
function getClient() {
    if (process.env.DATABASE_URL) {
        return new Client({ connectionString: process.env.DATABASE_URL });
    }

    return new Client({
        host: process.env.POSTGRES_HOST || "localhost",
        port: Number(process.env.POSTGRES_PORT || 5432),
        user: process.env.POSTGRES_USER || "finledger",
        password: process.env.POSTGRES_PASSWORD || "finledger",
        database: process.env.POSTGRES_DB || "finledger",
    });
}

async function dirExists(dir) {
    try {
        const stat = await fs.stat(dir);
        return stat.isDirectory();
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

// Find all .sql files in the provided directory, sorted alphabetically. Each file should be
// prepended with a number or timestamp to ensure the correct order.
async function getSqlFiles(dir) {
    if (!(await dirExists(dir))) {
        return [];
    }
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.toLowerCase().endsWith(".sql")).sort();
}

// Ensure the schema_migrations table exists. This keeps track of which migration files have been applied.
async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
}

// Apply all non-applied migration files from the migrations directory
async function applyMigrations(client) {
    const migrationFiles = await getSqlFiles(MIGRATIONS_DIR);
    if (migrationFiles.length === 0) {
        console.log(`No migration files found in ${MIGRATIONS_DIR}`);
        return;
    }

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.filename));

    for (const file of migrationFiles) {
        if (applied.has(file)) {
            continue;
        }

        const fullPath = path.join(MIGRATIONS_DIR, file);
        const rawSql = await fs.readFile(fullPath, "utf8");
        const sql = applyTemplate(rawSql);

        console.log(`Running migration ${file}`);
        await client.query("BEGIN");
        try {
            // Skip empty migration files
            if (sql.trim()) {
                await client.query(sql);
            } else {
                console.log(`Skipping empty migration ${file}`);
            }
            await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    }
}

// Main
async function run() {
    const sqlFiles = await getSqlFiles(SQL_DIR);
    if (sqlFiles.length === 0) {
        console.log(`No base SQL files found in ${SQL_DIR}`);
    }

    const client = getClient();
    await client.connect();

    try {
        for (const file of sqlFiles) {
            const fullPath = path.join(SQL_DIR, file);
            const rawSql = await fs.readFile(fullPath, "utf8");
            if (!rawSql.trim()) {
                continue;
            }

            // Replace templates and run
            const sql = applyTemplate(rawSql);
            console.log(`Running ${file}`);
            await client.query(sql);
        }

        await ensureMigrationsTable(client);
        await applyMigrations(client);
    } finally {
        await client.end();
    }
}

run().catch((error) => {
    console.error("Database init failed:", error);
    process.exit(1);
});
