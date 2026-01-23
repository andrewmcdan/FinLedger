const postgres = require("pg");

const query = async (text, params) => {
    const useTestDb = process.env.DB_TESTING_ENABLED === "true";
    const connectionString = useTestDb
        ? (process.env.DATABASE_URL_TEST || `postgresql://${process.env.POSTGRES_TEST_USER || "finledger_test"}:${process.env.POSTGRES_TEST_PASSWORD || "finledger_test"}@${process.env.POSTGRES_TEST_HOST || "localhost"}:${process.env.POSTGRES_TEST_PORT || 5433}/${process.env.POSTGRES_TEST_DB || "finledger_test"}`)
        : (process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || "finledger"}:${process.env.POSTGRES_PASSWORD || "finledger"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "finledger"}`);
    const client = new postgres.Client({ connectionString });

    await client.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        await client.end();
    }
}

module.exports = { query };