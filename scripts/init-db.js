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

// SQL files use templates like {{ADMIN_USERNAME}}, which are replaced with these values. Doing so allows
// us to keep sensitive values in the .env file instead of in the SQL files.
const templateValues = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_FIRST_NAME: process.env.ADMIN_FIRST_NAME || "Admin",
    ADMIN_LAST_NAME: process.env.ADMIN_LAST_NAME || "User",
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
        password:
            process.env.POSTGRES_PASSWORD ||
            "finledger",
        database:
            process.env.POSTGRES_DB || "finledger",
    });
}

// Find all .sql files in the SQL_DIR directory, sorted alphabetically. Each file should be
// prepended with a number to ensure the correct order.
async function getSqlFiles() {
    const entries = await fs.readdir(SQL_DIR);
    return entries
        .filter((entry) => entry.toLowerCase().endsWith(".sql"))
        .sort();
}

// Main
async function run() {
    const sqlFiles = await getSqlFiles();
    if (sqlFiles.length === 0) {
        console.log(`No SQL files found in ${SQL_DIR}`);
        return;
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
    } finally {
        await client.end();
    }
}

run().catch((error) => {
    console.error("Database init failed:", error);
    process.exit(1);
});
