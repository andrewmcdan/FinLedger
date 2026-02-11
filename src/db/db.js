const postgres = require("pg");

const useTestDb = process.env.DB_TESTING_ENABLED === "true";
const connectionString = useTestDb
    ? (process.env.DATABASE_URL_TEST || `postgresql://${process.env.POSTGRES_TEST_USER || "finledger_test"}:${process.env.POSTGRES_TEST_PASSWORD || "finledger_test"}@${process.env.POSTGRES_TEST_HOST || "localhost"}:${process.env.POSTGRES_TEST_PORT || 5433}/${process.env.POSTGRES_TEST_DB || "finledger_test"}`)
    : (process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || "finledger"}:${process.env.POSTGRES_PASSWORD || "finledger"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "finledger"}`);

const pool = new postgres.Pool({ connectionString });

const getLogger = () => {
    try {
        return require("../utils/logger");
    } catch (error) {
        return null;
    }
};

const logDb = (level, message, context = null) => {
    const logger = getLogger();
    if (!logger || typeof logger.log !== "function") {
        return;
    }
    logger.log(level, message, context, "", null, { skipDb: true });
};

const query = async (text, params, user_id = null) => {
    try {
        if (user_id) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                await client.query("SELECT set_config('app.user_id', $1, true)", [String(user_id)]);
                const result = await client.query(text, params);
                await client.query("COMMIT");
                return result;
            } catch (error) {
                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    logDb("error", "Failed to rollback user-scoped query", { error: rollbackError.message });
                }
                throw error;
            } finally {
                client.release();
            }
        }
        return await pool.query(text, params);
    } catch (error) {
        logDb("error", "Database query failed", {
            error: error.message,
            statement: text,
            paramCount: Array.isArray(params) ? params.length : 0,
            user_id,
        });
        throw error;
    }
};

const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        logDb("debug", "Starting database transaction");
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        logDb("debug", "Committed database transaction");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
            logDb("warn", "Rolled back database transaction", { error: error.message });
        } catch (rollbackError) {
            console.error("Failed to rollback transaction:", rollbackError);
            logDb("error", "Failed to rollback database transaction", { error: rollbackError.message });
        }
        throw error;
    } finally {
        client.release();
    }
};

const getClient = async () => {
    return pool.connect();
};

const closePool = async () => {
    logDb("info", "Closing database pool", { useTestDb });
    await pool.end();
};

process.on("SIGINT", () => {
    closePool().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    closePool().finally(() => process.exit(0));
});

module.exports = { query, transaction, getClient, closePool };
