const postgres = require("pg");

const useTestDb = process.env.DB_TESTING_ENABLED === "true";
const connectionString = useTestDb
    ? (process.env.DATABASE_URL_TEST || `postgresql://${process.env.POSTGRES_TEST_USER || "finledger_test"}:${process.env.POSTGRES_TEST_PASSWORD || "finledger_test"}@${process.env.POSTGRES_TEST_HOST || "localhost"}:${process.env.POSTGRES_TEST_PORT || 5433}/${process.env.POSTGRES_TEST_DB || "finledger_test"}`)
    : (process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || "finledger"}:${process.env.POSTGRES_PASSWORD || "finledger"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "finledger"}`);

const pool = new postgres.Pool({ connectionString });

const query = async (text, params) => {
    return pool.query(text, params);
};

const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Failed to rollback transaction:", rollbackError);
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
    await pool.end();
};

process.on("SIGINT", () => {
    closePool().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    closePool().finally(() => process.exit(0));
});

module.exports = { query, transaction, getClient, closePool };
