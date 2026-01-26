/**
 * Database Reset Script
 *
 * This script connects to the Postgres database using environment variables and
 * drops all non-system tables in the current database. This provides a clean slate
 * before re-running migrations or base SQL files.
 *
 * Usage:
 *   node scripts/reset-db.js
 *   node scripts/reset-db.js --db-test
 */

const fs = require("fs/promises");
const path = require("path");
const { Client } = require("pg");

const VERBOSE = process.env.DB_RESET_VERBOSE !== "0";
const USER_ICONS_DIR = path.resolve(__dirname, "..", "user-icons");
const USER_DOCS_DIR = path.resolve(__dirname, "..", "user-docs");

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

function shouldUseTestDb() {
    const argv = new Set(process.argv);
    return argv.has("--db-test") || argv.has("--test-db") || process.env.DB_TESTING_ENABLED === "true";
}

// Create a new Postgres client using environment variables. Sane defaults are provided.
function getClient() {
    const useTestDb = shouldUseTestDb();
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
    return new Client({
        host: process.env.POSTGRES_HOST || "localhost",
        port: Number(process.env.POSTGRES_PORT || 5432),
        user: process.env.POSTGRES_USER || "finledger",
        password: process.env.POSTGRES_PASSWORD || "finledger",
        database: process.env.POSTGRES_DB || "finledger",
    });
}

function getTargetDbName() {
    const useTestDb = shouldUseTestDb();
    if (useTestDb) {
        return process.env.POSTGRES_TEST_DB || "finledger_test";
    }
    return process.env.POSTGRES_DB || "finledger";
}

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function getUserTables(client) {
    const { rows } = await client.query(`
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname <> 'information_schema'
          AND schemaname NOT LIKE 'pg_%'
        ORDER BY schemaname, tablename;
    `);
    return rows;
}

async function dropAllTables(client) {
    const tables = await getUserTables(client);
    if (tables.length === 0) {
        logInfo("No user tables found to drop.");
        return;
    }

    const qualifiedTables = tables.map(
        ({ schemaname, tablename }) => `${quoteIdentifier(schemaname)}.${quoteIdentifier(tablename)}`
    );

    logInfo(`Dropping ${qualifiedTables.length} tables from ${getTargetDbName()}...`);
    if (VERBOSE) {
        logInfo(`Tables: ${qualifiedTables.join(", ")}`);
    }

    await client.query("BEGIN");
    try {
        await client.query(`DROP TABLE IF EXISTS ${qualifiedTables.join(", ")} CASCADE`);
        await client.query("COMMIT");
        logInfo("All tables dropped.");
    } catch (error) {
        await client.query("ROLLBACK");
        logError("Failed to drop tables.", error);
        throw error;
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

async function clearDirectory(dir) {
    if (!(await dirExists(dir))) {
        return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (entries.length === 0) {
        logInfo(`No files to delete in ${dir}`);
        return;
    }

    logInfo(`Deleting ${entries.length} item(s) from ${dir}...`);
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await fs.rm(entryPath, { recursive: true, force: true });
        } else {
            await fs.unlink(entryPath);
        }
    }
    logInfo(`Cleared ${dir}`);
}

async function run() {
    const client = getClient();
    try {
        await client.connect();
        logInfo("Connected to Postgres.");
    } catch (error) {
        logError("Failed to connect to Postgres.", error);
        throw error;
    }

    try {
        await dropAllTables(client);
        await clearDirectory(USER_ICONS_DIR);
        await clearDirectory(USER_DOCS_DIR);
    } finally {
        await client.end();
        logInfo("Postgres connection closed.");
    }
}

run().catch((error) => {
    logError("Database reset failed.", error);
    process.exit(1);
});
