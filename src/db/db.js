const postgres = require("pg");
const logger = require("../utils/logger");
const utilities = require("../utils/utilities");

const query = async (text, params) => {
    logger.log("trace", `Executing query: ${text} with params: ${JSON.stringify(params)}`, { function: "db.query" }, utilities.getCallerInfo());
    const client = new postgres.Client({
        connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || "finledger"}:${process.env.POSTGRES_PASSWORD || "finledger"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "finledger"}`,
    });

    await client.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        await client.end();
    }
}

module.exports = { query };