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
const README_PATH = path.join(SQL_DIR, "README.md");
const VERBOSE = process.env.DB_INIT_VERBOSE !== "0";

function logInfo(message) {
    if (VERBOSE) {
        console.log(message);
    }
}

function logError(message, error) {
    console.error(message);
    if (error) {
        console.error(error);
    }
}

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
    const argv = new Set(process.argv);
    const useTestDb = argv.has("--db-test") || argv.has("--test-db") || process.env.DB_TESTING_ENABLED === "true";
    if (useTestDb && process.env.DATABASE_URL_TEST) {
        logInfo("Using DATABASE_URL_TEST for Postgres connection (test DB).");
        return new Client({ connectionString: process.env.DATABASE_URL_TEST });
    }
    if (!useTestDb && process.env.DATABASE_URL) {
        logInfo("Using DATABASE_URL for Postgres connection.");
        return new Client({ connectionString: process.env.DATABASE_URL });
    }

    if (useTestDb) {
        logInfo("Using POSTGRES_TEST_* environment variables for Postgres connection (test DB).");
        return new Client({
            host: process.env.POSTGRES_TEST_HOST || "localhost",
            port: Number(process.env.POSTGRES_TEST_PORT || 5433),
            user: process.env.POSTGRES_TEST_USER || "finledger_test",
            password: process.env.POSTGRES_TEST_PASSWORD || "finledger_test",
            database: process.env.POSTGRES_TEST_DB || "finledger_test",
        });
    }

    logInfo("Using POSTGRES_* environment variables for Postgres connection.");
    let port = Number(process.env.POSTGRES_PORT || 5432);
    if(process.env.POSTGRES_HOST && (process.env.POSTGRES_HOST === "db")) {
        port = 5432;
    }
    return new Client({
        host: process.env.POSTGRES_HOST || "localhost",
        port: port,
        user: process.env.POSTGRES_USER || "finledger",
        password: process.env.POSTGRES_PASSWORD || "finledger",
        database: process.env.POSTGRES_DB || "finledger",
    });
}

function getAdminClient() {
    const argv = new Set(process.argv);
    const useTestDb = argv.has("--db-test") || argv.has("--test-db") || process.env.DB_TESTING_ENABLED === "true";
    if (useTestDb) {
        return new Client({
            host: process.env.POSTGRES_TEST_HOST || "localhost",
            port: Number(process.env.POSTGRES_TEST_PORT || 5433),
            user: process.env.POSTGRES_TEST_USER || "finledger_test",
            password: process.env.POSTGRES_TEST_PASSWORD || "finledger_test",
            database: process.env.POSTGRES_TEST_ADMIN_DB || "postgres",
        });
    }
    let port = Number(process.env.POSTGRES_PORT || 5432);
    if(process.env.POSTGRES_HOST && (process.env.POSTGRES_HOST === "db")) {
        port = 5432;
    }
    return new Client({
        host: process.env.POSTGRES_HOST || "localhost",
        port: port,
        user: process.env.POSTGRES_USER || "finledger",
        password: process.env.POSTGRES_PASSWORD || "finledger",
        database: process.env.POSTGRES_ADMIN_DB || "postgres",
    });
}

function getTargetDbName() {
    const argv = new Set(process.argv);
    const useTestDb = argv.has("--db-test") || argv.has("--test-db") || process.env.DB_TESTING_ENABLED === "true";
    if (useTestDb) {
        return process.env.POSTGRES_TEST_DB || "finledger_test";
    }
    return process.env.POSTGRES_DB || "finledger";
}

async function ensureDatabaseExists() {
    const targetDb = getTargetDbName();
    const adminClient = getAdminClient();
    try {
        await adminClient.connect();
        const result = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
        if (result.rowCount === 0) {
            logInfo(`Database ${targetDb} not found. Creating...`);
            await adminClient.query(`CREATE DATABASE "${targetDb}"`);
        } else {
            logInfo(`Database ${targetDb} already exists.`);
        }
    } finally {
        await adminClient.end();
    }
}

async function dirExists(dir) {
    try {
        const stat = await fs.stat(dir);
        return stat.isDirectory();
    } catch (error) {
        if (error.code === "ENOENT") {
            logInfo(`Directory not found: ${dir}`);
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
        logInfo(`No migration files found in ${MIGRATIONS_DIR}`);
        return;
    }

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.filename));

    for (const file of migrationFiles) {
        if (applied.has(file)) {
            logInfo(`Skipping already applied migration ${file}`);
            continue;
        }

        const fullPath = path.join(MIGRATIONS_DIR, file);
        const rawSql = await fs.readFile(fullPath, "utf8");
        const sql = applyTemplate(rawSql);

        logInfo(`Running migration ${file}`);
        await client.query("BEGIN");
        try {
            // Skip empty migration files
            if (sql.trim()) {
                await client.query(sql);
            } else {
                logInfo(`Skipping empty migration ${file}`);
            }
            await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            logError(`Migration failed: ${file}`, error);
            throw error;
        }
    }
}

function formatColumnType(row) {
    if (row.data_type === "USER-DEFINED") {
        return row.udt_name;
    }
    if (row.data_type === "ARRAY") {
        const baseType = row.udt_name && row.udt_name.startsWith("_") ? row.udt_name.slice(1) : row.udt_name;
        return baseType ? `${baseType}[]` : "array";
    }
    return row.data_type;
}

async function getDbStructure(client) {
    const { rows } = await client.query(`
        SELECT c.table_schema,
               c.table_name,
               c.column_name,
               c.data_type,
               c.udt_name,
               c.ordinal_position
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE t.table_type = 'BASE TABLE'
          AND c.table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position;
    `);

    const tables = new Map();
    for (const row of rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`;
        if (!tables.has(tableKey)) {
            tables.set(tableKey, []);
        }
        tables.get(tableKey).push({
            name: row.column_name,
            type: formatColumnType(row),
        });
    }
    return tables;
}

function replaceSection(content, header, section) {
    const start = content.indexOf(header);
    if (start === -1) {
        return `${content.trimEnd()}\n\n${section}\n`;
    }
    const afterHeader = start + header.length;
    const rest = content.slice(afterHeader);
    const nextHeaderOffset = rest.search(/\n##\s+/);
    if (nextHeaderOffset === -1) {
        return `${content.slice(0, start).trimEnd()}\n\n${section}\n`;
    }
    const before = content.slice(0, start).trimEnd();
    const after = rest.slice(nextHeaderOffset).trimStart();
    return `${before}\n\n${section}\n\n${after}`;
}

async function updateDbStructureReadme(client) {
    const header = "## DB-Structure";
    const tables = await getDbStructure(client);
    const lines = [header, ""];

    if (tables.size === 0) {
        lines.push("_No tables found in the database._");
    } else {
        for (const [tableName, columns] of tables.entries()) {
            lines.push(`### ${tableName}`);
            for (const column of columns) {
                lines.push(`- ${column.name}: ${column.type}`);
            }
            lines.push("");
        }
    }

    let readmeContents = "";
    try {
        readmeContents = await fs.readFile(README_PATH, "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    const updated = replaceSection(readmeContents || "", header, lines.join("\n").trimEnd());
    await fs.writeFile(README_PATH, updated, "utf8");
    logInfo(`Updated DB structure in ${README_PATH}`);
}

// Main
async function run() {
    logInfo(`Base SQL directory: ${SQL_DIR}`);
    logInfo(`Migrations directory: ${MIGRATIONS_DIR}`);
    const sqlFiles = await getSqlFiles(SQL_DIR);
    if (sqlFiles.length === 0) {
        logInfo(`No base SQL files found in ${SQL_DIR}`);
    } else {
        logInfo(`Base SQL files: ${sqlFiles.join(", ")}`);
    }

    await ensureDatabaseExists();
    const client = getClient();
    try {
        await client.connect();
        logInfo("Connected to Postgres.");
    } catch (error) {
        logError("Failed to connect to Postgres.", error);
        throw error;
    }

    try {
        for (const file of sqlFiles) {
            const fullPath = path.join(SQL_DIR, file);
            const rawSql = await fs.readFile(fullPath, "utf8");
            if (!rawSql.trim()) {
                logInfo(`Skipping empty SQL file ${file}`);
                continue;
            }

            // Replace templates and run
            const sql = applyTemplate(rawSql);
            logInfo(`Running ${file}`);
            try {
                await client.query(sql);
            } catch (error) {
                logError(`Failed running ${file}`, error);
                throw error;
            }
        }

        await ensureMigrationsTable(client);
        await applyMigrations(client);
        await updateDbStructureReadme(client);
    } finally {
        await client.end();
        logInfo("Postgres connection closed.");
    }
}

run().catch((error) => {
    logError("Database init failed.", error);
    process.exit(1);
});
