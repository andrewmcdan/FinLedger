const db = require("../db/db");
const { isAdmin, isManager } = require("./users");
const {log} = require("../utils/logger");
const {getCallerInfo} = require("../utils/utilities");

function isNumericId(value) {
    if (typeof value === "number") {
        return Number.isInteger(value);
    }
    if (typeof value === "string") {
        return /^\d+$/.test(value.trim());
    }
    return false;
}

async function resolveCategory(client, accountCategory) {
    const isId = isNumericId(accountCategory);
    const query = isId
        ? "SELECT id, account_number_prefix FROM account_categories WHERE id = $1"
        : "SELECT id, account_number_prefix FROM account_categories WHERE name = $1";
    const param = isId ? Number(accountCategory) : accountCategory;
    const result = await client.query(query, [param]);
    if (result.rows.length === 0) {
        throw new Error(`Account category not found: ${accountCategory}`);
    }
    return result.rows[0];
}

async function resolveSubcategory(client, accountSubcategory, categoryId) {
    const isId = isNumericId(accountSubcategory);
    const query = isId
        ? "SELECT id, order_index, account_category_id FROM account_subcategories WHERE id = $1"
        : "SELECT id, order_index, account_category_id FROM account_subcategories WHERE name = $1";
    const param = isId ? Number(accountSubcategory) : accountSubcategory;
    const result = await client.query(query, [param]);
    if (result.rows.length === 0) {
        throw new Error(`Account subcategory not found: ${accountSubcategory}`);
    }
    const subcategory = result.rows[0];
    if (categoryId !== undefined && categoryId !== null && String(subcategory.account_category_id) !== String(categoryId)) {
        throw new Error(`Account subcategory not found: ${accountSubcategory}`);
    }
    return subcategory;
}

async function listAccounts(userId, token) {
    let query = "SELECT * FROM accounts";
    const params = [];
    if (!await isAdmin(userId, token) && !await isManager(userId, token)) {
        query += " WHERE owner_id = $1";
        params.push(userId);
    }
    return db.query(query, params);
}

async function createAccount(ownerId, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, totalDebits, totalCredits, accountOrder, statementType, comments) {
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

    const { accountNumber, categoryId, subcategoryId } = await generateNewAccountNumber(accountCategory, accountSubcategory, accountOrder);

    try {
        const query = `
        INSERT INTO accounts 
        (user_id, account_name, account_description, normal_side, account_category_id, account_subcategory_id, balance, initial_balance, total_debits, total_credits, account_order, statement_type, comment, account_number) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
        RETURNING *`;
        const params = [ownerId, accountName, accountDescription, normalSide, categoryId, subcategoryId, balance, initialBalance, totalDebits, totalCredits, accountOrder, normalizedStatementType, comments, accountNumber];
        const result = await db.query(query, params);
        const error = result?.error;
        if (result.rows.length === 0) {
            log("error", "Account creation failed", { ownerId, accountName, error }, getCallerInfo());
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
        const category = await resolveCategory(client, accountCategory);
        const subcategory = await resolveSubcategory(client, accountSubcategory, category.id);

        const categoryCode = String(category.account_number_prefix).padStart(2, "0");
        const subcategoryCode = String(subcategory.order_index).padStart(2, "0");
        const base = `${categoryCode}${subcategoryCode}${orderCode}`;

        const suffixRes = await client.query(
            `SELECT MAX(CAST(RIGHT(account_number::text, 2) AS INT)) AS max_suffix
             FROM accounts
             WHERE account_category_id = $1
               AND account_subcategory_id = $2
               AND account_order = $3`,
            [category.id, subcategory.id, orderValue],
        );

        const maxSuffix = suffixRes.rows[0]?.max_suffix;
        const nextSuffix = maxSuffix === null || maxSuffix === undefined ? 0 : Number(maxSuffix) + 1;
        if (nextSuffix > 99) {
            throw new Error(`Account suffix overflow for ${accountCategory} / ${accountSubcategory} / order ${orderValue}`);
        }

        const suffixCode = String(nextSuffix).padStart(2, "0");
        return {
            accountNumber: `${base}${suffixCode}`,
            categoryId: category.id,
            subcategoryId: subcategory.id,
        };
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
