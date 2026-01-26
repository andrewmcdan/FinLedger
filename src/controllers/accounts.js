const db = require("../db/db");
const { isAdmin, isManager } = require("./users");

function listAccounts(userId, token) {
    let query = "SELECT * FROM accounts";
    const params = [];
    if (!isAdmin(userId, token) && !isManager(userId, token)) {
        query += " WHERE owner_id = $1";
        params.push(userId);
    }
    return db.query(query, params);
}

async function createAccount(ownerId, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, totalDebits, totalCredits, accountOrder, statementType, comments) {
    const accountNumber = await generateNewAccountNumber(accountCategory, accountSubcategory, accountOrder);
    const statementTypeMap = {
        "Income Statement": "IS",
        "Balance Sheet": "BS",
        "Retained Earnings Statement": "RE",
        IS: "IS",
        BS: "BS",
        RE: "RE",
    };
    const normalizedStatementType = statementTypeMap[statementType];
    if (!normalizedStatementType) {
        throw new Error(`Invalid statement type: ${statementType}`);
    }

    try {
        const query = `
        INSERT INTO accounts 
        (user_id, account_name, account_description, normal_side, account_category, account_subcategory, balance, initial_balance, total_debits, total_credits, account_order, statement_type, comment, account_number) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
        RETURNING *`;
        const params = [ownerId, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, totalDebits, totalCredits, accountOrder, normalizedStatementType, comments, accountNumber];
        const result = await db.query(query, params);
        const error = result?.error;
        if (result.rows.length === 0) {
            throw new Error("Account creation failed. Error: " + error.message);
        }
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

async function generateNewAccountNumber(accountCategory, accountSubcategory, accountOrder) {
    const orderValue = Number.parseInt(accountOrder ?? 0, 10);
    if (!Number.isFinite(orderValue)) {
        throw new Error(`Invalid account order: ${accountOrder}`);
    }

    const orderCode = String(orderValue).padStart(2, "0");
    if (orderCode.length !== 2) {
        throw new Error(`Account order must be between 0 and 99. Received: ${accountOrder}`);
    }

    return db.transaction(async (client) => {
        const categoryRes = await client.query("SELECT account_number_prefix FROM account_categories WHERE name = $1", [accountCategory]);
        if (categoryRes.rows.length === 0) {
            throw new Error(`Account category not found: ${accountCategory}`);
        }

        const subcategoryRes = await client.query("SELECT order_index FROM account_subcategories WHERE name = $1", [accountSubcategory]);
        if (subcategoryRes.rows.length === 0) {
            throw new Error(`Account subcategory not found: ${accountSubcategory}`);
        }

        const categoryCode = String(categoryRes.rows[0].account_number_prefix).padStart(2, "0");
        const subcategoryCode = String(subcategoryRes.rows[0].order_index).padStart(2, "0");
        const base = `${categoryCode}${subcategoryCode}${orderCode}`;

        const suffixRes = await client.query(
            `SELECT MAX(CAST(RIGHT(account_number::text, 2) AS INT)) AS max_suffix
             FROM accounts
             WHERE account_category = $1
               AND account_subcategory = $2
               AND account_order = $3`,
            [accountCategory, accountSubcategory, orderValue],
        );

        const maxSuffix = suffixRes.rows[0]?.max_suffix;
        const nextSuffix = maxSuffix === null || maxSuffix === undefined ? 0 : Number(maxSuffix) + 1;
        if (nextSuffix > 99) {
            throw new Error(`Account suffix overflow for ${accountCategory} / ${accountSubcategory} / order ${orderValue}`);
        }

        const suffixCode = String(nextSuffix).padStart(2, "0");
        return `${base}${suffixCode}`;
    });
}

async function listAccountCategories() {
    let query = "SELECT * FROM account_categories ORDER BY name ASC";
    const result = {};
    result.categories = (await db.query(query)).rows;
    query = "SELECT * FROM account_subcategories ORDER BY account_category_id ASC, order_index ASC, name ASC";
    result.subcategories = (await db.query(query)).rows;
    return result;
}

module.exports = {
    listAccounts,
    createAccount,
    listAccountCategories,
};
