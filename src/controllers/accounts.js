const db = require("../db/db");
const { isAdmin, isManager } = require("./users");
const {log} = require("../utils/logger");
const {getCallerInfo, sanitizeInput} = require("../utils/utilities");

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

async function listAccounts(userId, token, offset = 0, limit = 25) {
    sanitizeInput(offset);
    sanitizeInput(limit);
    let query = "SELECT * FROM accounts";
    const params = [];
    if (!await isAdmin(userId, token) && !await isManager(userId, token)) {
        query += " WHERE user_id = $1";
        params.push(userId);
    }
    query += " ORDER BY account_number ASC LIMIT $"+(params.length+1)+" OFFSET $"+(params.length+2);
    params.push(limit);
    params.push(offset);
    return db.query(query, params);
}

async function getAccountCounts(userId, token) {
    sanitizeInput(userId);
    sanitizeInput(token);
    let query = "SELECT COUNT(*) AS total_accounts FROM accounts";
    const params = [];
    if (!await isAdmin(userId, token) && !await isManager(userId, token)) {
        query += " WHERE user_id = $1";
        params.push(userId);
    }
    const result = await db.query(query, params);
    return result.rows[0];
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

async function updateAccountField({ account_id, field, value }) {
    sanitizeInput(account_id);
    sanitizeInput(field);
    sanitizeInput(value);
    const allowedFields = [
        "account_name",
        "account_number",
        "account_description",
        "normal_side",
        "statement_type",
        "comment",
        "account_category_id",
        "account_subcategory_id",
        "user_id",
    ];
    if (!allowedFields.includes(field)) {
        return {success: false, message: `Field "${field}" cannot be updated.`};
    }
    const coerceBigInt = (rawValue, { allowNull = false } = {}) => {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            if (allowNull) {
                return { ok: true, value: null };
            }
            return { ok: false, message: "Value is required." };
        }
        const trimmed = String(rawValue).trim();
        if (!/^\d+$/.test(trimmed)) {
            return { ok: false, message: "Value must be a whole number." };
        }
        return { ok: true, value: trimmed };
    };
    const normalizeStatementType = (rawValue) => {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return { ok: false, message: "Statement type is required." };
        }
        const statementTypeMap = {
            "Income Statement": "IS",
            "Balance Sheet": "BS",
            "Retained Earnings Statement": "RE",
            IS: "IS",
            BS: "BS",
            RE: "RE",
        };
        const resolved = statementTypeMap[String(rawValue).trim()];
        if (!resolved) {
            return { ok: false, message: `Invalid statement type: ${rawValue}` };
        }
        return { ok: true, value: resolved };
    };
    const normalizeNormalSide = (rawValue) => {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return { ok: false, message: "Normal side is required." };
        }
        const normalized = String(rawValue).trim().toLowerCase();
        if (!["debit", "credit"].includes(normalized)) {
            return { ok: false, message: `Invalid normal side: ${rawValue}` };
        }
        return { ok: true, value: normalized };
    };

    let resolvedValue = value;
    if (["account_number", "account_category_id", "account_subcategory_id", "user_id"].includes(field)) {
        const numericResult = coerceBigInt(value, { allowNull: false });
        if (!numericResult.ok) {
            return { success: false, message: numericResult.message };
        }
        resolvedValue = numericResult.value;
    } else if (field === "statement_type") {
        const statementResult = normalizeStatementType(value);
        if (!statementResult.ok) {
            return { success: false, message: statementResult.message };
        }
        resolvedValue = statementResult.value;
    } else if (field === "normal_side") {
        const normalResult = normalizeNormalSide(value);
        if (!normalResult.ok) {
            return { success: false, message: normalResult.message };
        }
        resolvedValue = normalResult.value;
    }

    let query = `UPDATE accounts SET ${field} = $1 WHERE id = $2 RETURNING *`;
    const params = [resolvedValue, account_id];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        return {success: false, message: `Account with ID ${account_id} not found.`};
    }
    return {success: true, message: "Account updated successfully", account: result.rows[0]};
};

async function deactivateAccount(accountId) {
    if (!await isValidAccountId(accountId)) {
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    sanitizeInput(accountId);
    const query = `UPDATE accounts SET status = $1 WHERE id = $2 RETURNING *`;
    const params = ['inactive', accountId];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    return result.rows[0];
}

async function activateAccount(accountId) {
    if (!await isValidAccountId(accountId)) {
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    const query = `UPDATE accounts SET status = $1 WHERE id = $2 RETURNING *`;
    const params = ['active', accountId];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    return result.rows[0];
}

async function isValidAccountId(accountId) {
    const query = `SELECT id FROM accounts WHERE id = $1`;
    const params = [accountId];
    const result = await db.query(query, params);
    return result.rows.length > 0;
}

async function setAccountStatus(accountId, status) {
    sanitizeInput(status);
    sanitizeInput(accountId);
    if (!await isValidAccountId(accountId)) {
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    if (status === 'active') {
        return activateAccount(accountId);
    } else if (status === 'inactive') {
        return deactivateAccount(accountId);
    } else {
        throw new Error(`Invalid status: ${status}`);
    }
}

async function addCategory(categoryName, accountNumberPrefix, categoryDescription, initialSubcategoryName, initialSubcategoryDescription) {
    sanitizeInput(categoryName);
    sanitizeInput(accountNumberPrefix);
    sanitizeInput(categoryDescription);
    sanitizeInput(initialSubcategoryName);
    sanitizeInput(initialSubcategoryDescription);
    return db.transaction(async (client) => {
        const categoryCheck = await client.query("SELECT id FROM account_categories WHERE name = $1", [categoryName]);
        if (categoryCheck.rows.length > 0) {
            throw new Error(`Account category with name "${categoryName}" already exists.`);
        }
        const subcategoryCheck = await client.query("SELECT id FROM account_subcategories WHERE name = $1", [initialSubcategoryName]);
        if (subcategoryCheck.rows.length > 0) {
            throw new Error(`Account subcategory with name "${initialSubcategoryName}" already exists.`);
        }
        const categoryResult = await client.query(
            `
            INSERT INTO account_categories (name, description, account_number_prefix)
            VALUES ($1, $2, $3)
            RETURNING *`,
            [categoryName, categoryDescription || null, accountNumberPrefix],
        );
        if (categoryResult.rows.length === 0) {
            throw new Error("Category creation failed.");
        }
        const category = categoryResult.rows[0];
        const subcategoryResult = await client.query(
            `
            INSERT INTO account_subcategories (name, description, account_category_id, order_index)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [initialSubcategoryName, initialSubcategoryDescription || null, category.id, 0],
        );
        if (subcategoryResult.rows.length === 0) {
            throw new Error("Subcategory creation failed.");
        }
        return { category, subcategory: subcategoryResult.rows[0] };
    });
}

async function addSubcategory(subcategoryName, accountCategoryId, orderIndex, subcategoryDescription) {
    sanitizeInput(subcategoryName);
    sanitizeInput(accountCategoryId);
    sanitizeInput(orderIndex);
    sanitizeInput(subcategoryDescription);
    return db.transaction(async (client) => {
        const categoryCheck = await client.query("SELECT id FROM account_categories WHERE id = $1", [accountCategoryId]);
        if (categoryCheck.rows.length === 0) {
            throw new Error(`Account category with ID ${accountCategoryId} does not exist.`);
        }
        const subcategoryCheck = await client.query("SELECT id FROM account_subcategories WHERE name = $1 AND account_category_id = $2", [subcategoryName, accountCategoryId]);
        if (subcategoryCheck.rows.length > 0) {
            throw new Error(`Account subcategory with name "${subcategoryName}" already exists for category ID ${accountCategoryId}.`);
        }
        let resolvedOrderIndex = Number.parseInt(orderIndex, 10);
        if (!Number.isFinite(resolvedOrderIndex)) {
            const nextIndexResult = await client.query(
                "SELECT COALESCE(MAX(order_index), 0) + 1 AS next_index FROM account_subcategories WHERE account_category_id = $1",
                [accountCategoryId],
            );
            resolvedOrderIndex = nextIndexResult.rows[0]?.next_index ?? 0;
        }
        const result = await client.query(
            `
            INSERT INTO account_subcategories (name, description, account_category_id, order_index)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [subcategoryName, subcategoryDescription || null, accountCategoryId, resolvedOrderIndex],
        );
        if (result.rows.length === 0) {
            throw new Error("Subcategory creation failed.");
        }
        return result.rows[0];
    });
}

async function deleteCategory(categoryId) {
    sanitizeInput(categoryId);
    return db.transaction(async (client) => {
        const accountCheck = await client.query(
            `SELECT 1
             FROM accounts
             WHERE account_category_id = $1
                OR account_subcategory_id IN (
                    SELECT id FROM account_subcategories WHERE account_category_id = $1
                )
             LIMIT 1`,
            [categoryId],
        );
        if (accountCheck.rows.length > 0) {
            throw new Error(`Cannot delete category ID ${categoryId} because it has associated accounts.`);
        }
        await client.query("DELETE FROM account_categories WHERE id = $1", [categoryId]);
        return { success: true };
    });
}

async function deleteSubcategory(subcategoryId) {
    sanitizeInput(subcategoryId);
    return db.transaction(async (client) => {
        const accountCheck = await client.query("SELECT id FROM accounts WHERE account_subcategory_id = $1", [subcategoryId]);
        if (accountCheck.rows.length > 0) {
            throw new Error(`Cannot delete subcategory ID ${subcategoryId} because it has associated accounts.`);
        }
        await client.query("DELETE FROM account_subcategories WHERE id = $1", [subcategoryId]);
        return { success: true };
    });
}

module.exports = {
    listAccounts,
    createAccount,
    listAccountCategories,
    getAccountCounts,
    updateAccountField,
    setAccountStatus,
    addCategory,
    addSubcategory,
    deleteCategory,
    deleteSubcategory,
};
