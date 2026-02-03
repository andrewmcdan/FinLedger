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

const statementTypeMap = {
    "Income Statement": "IS",
    "Balance Sheet": "BS",
    "Retained Earnings Statement": "RE",
    IS: "IS",
    BS: "BS",
    RE: "RE",
};

const normalizeStatementTypeFilter = (rawValue) => {
    const trimmed = String(rawValue ?? "").trim();
    if (!trimmed) {
        return "";
    }
    const upper = trimmed.toUpperCase();
    return statementTypeMap[trimmed] || statementTypeMap[upper] || trimmed;
};

const normalizeStatusFilter = (rawValue) => {
    const normalized = String(rawValue ?? "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }
    return ["active", "inactive"].includes(normalized) ? normalized : "";
};

const normalizeNormalSideFilter = (rawValue) => {
    const normalized = String(rawValue ?? "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }
    return ["debit", "credit"].includes(normalized) ? normalized : "";
};

const FILTER_FIELD_MAP = {
    account_number: { column: "accounts.account_number::text", type: "contains" },
    account_name: { column: "accounts.account_name", type: "contains" },
    user_id: { column: "accounts.user_id", type: "equals" },
    status: { column: "accounts.status", type: "equals", normalize: normalizeStatusFilter },
    account_type: { column: "accounts.normal_side", type: "equals", normalize: normalizeNormalSideFilter },
    account_category_id: { column: "accounts.account_category_id", type: "equals" },
    account_subcategory_id: { column: "accounts.account_subcategory_id", type: "equals" },
    statement_type: { column: "accounts.statement_type", type: "equals", normalize: normalizeStatementTypeFilter },
    balance: { column: "accounts.balance", type: "range" },
    account_description: { column: "accounts.account_description", type: "contains" },
    comment: { column: "accounts.comment", type: "contains" },
};

const SORT_FIELD_MAP = {
    account_number: { column: "accounts.account_number" },
    account_name: { column: "accounts.account_name" },
    user_id: { column: "COALESCE(users.username, '')", requiresUserJoin: true },
    status: { column: "accounts.status" },
    account_type: { column: "accounts.normal_side" },
    account_category_id: { column: "accounts.account_category_id" },
    account_subcategory_id: { column: "accounts.account_subcategory_id" },
    statement_type: { column: "accounts.statement_type" },
    balance: { column: "accounts.balance" },
};

const normalizeQueryValue = (value) => (Array.isArray(value) ? value[0] : value);

const buildAccountFilterClauses = ({ filterField, filterValue, filterMin, filterMax }, params) => {
    const clauses = [];
    const normalizedField = normalizeQueryValue(filterField);
    const config = FILTER_FIELD_MAP[normalizedField];
    if (!config) {
        return clauses;
    }
    if (config.type === "contains") {
        const value = String(normalizeQueryValue(filterValue) ?? "").trim();
        if (!value) {
            return clauses;
        }
        params.push(`%${value}%`);
        clauses.push(`${config.column} ILIKE $${params.length}`);
        return clauses;
    }
    if (config.type === "equals") {
        const rawValue = normalizeQueryValue(filterValue);
        const normalized = config.normalize ? config.normalize(rawValue) : String(rawValue ?? "").trim();
        if (!normalized) {
            return clauses;
        }
        params.push(normalized);
        clauses.push(`${config.column} = $${params.length}`);
        return clauses;
    }
    if (config.type === "range") {
        const minValue = Number.parseFloat(normalizeQueryValue(filterMin));
        const maxValue = Number.parseFloat(normalizeQueryValue(filterMax));
        if (Number.isFinite(minValue)) {
            params.push(minValue);
            clauses.push(`${config.column} >= $${params.length}`);
        }
        if (Number.isFinite(maxValue)) {
            params.push(maxValue);
            clauses.push(`${config.column} <= $${params.length}`);
        }
    }
    return clauses;
};

const resolveAccountSort = (sortField, sortDirection) => {
    const normalizedField = normalizeQueryValue(sortField);
    const normalizedDirection = normalizeQueryValue(sortDirection);
    const config = SORT_FIELD_MAP[normalizedField];
    if (!config) {
        return { orderBy: "accounts.account_number ASC", requiresUserJoin: false };
    }
    const direction = String(normalizedDirection ?? "").toLowerCase() === "desc" ? "DESC" : "ASC";
    return {
        orderBy: `${config.column} ${direction}, accounts.account_number ASC`,
        requiresUserJoin: Boolean(config.requiresUserJoin),
    };
};

async function resolveCategory(client, accountCategory) {
    log("debug", "Resolving account category", { accountCategory }, getCallerInfo());
    const isId = isNumericId(accountCategory);
    const query = isId
        ? "SELECT id, account_number_prefix FROM account_categories WHERE id = $1"
        : "SELECT id, account_number_prefix FROM account_categories WHERE name = $1";
    const param = isId ? Number(accountCategory) : accountCategory;
    const result = await client.query(query, [param]);
    if (result.rows.length === 0) {
        log("warn", "Account category not found", { accountCategory }, getCallerInfo());
        throw new Error(`Account category not found: ${accountCategory}`);
    }
    return result.rows[0];
}

async function resolveSubcategory(client, accountSubcategory, categoryId) {
    log("debug", "Resolving account subcategory", { accountSubcategory, categoryId }, getCallerInfo());
    const isId = isNumericId(accountSubcategory);
    const query = isId
        ? "SELECT id, order_index, account_category_id FROM account_subcategories WHERE id = $1"
        : "SELECT id, order_index, account_category_id FROM account_subcategories WHERE name = $1";
    const param = isId ? Number(accountSubcategory) : accountSubcategory;
    const result = await client.query(query, [param]);
    if (result.rows.length === 0) {
        log("warn", "Account subcategory not found", { accountSubcategory }, getCallerInfo());
        throw new Error(`Account subcategory not found: ${accountSubcategory}`);
    }
    const subcategory = result.rows[0];
    if (categoryId !== undefined && categoryId !== null && String(subcategory.account_category_id) !== String(categoryId)) {
        log("warn", "Account subcategory category mismatch", { accountSubcategory, categoryId, subcategoryCategoryId: subcategory.account_category_id }, getCallerInfo());
        throw new Error(`Account subcategory not found: ${accountSubcategory}`);
    }
    return subcategory;
}

async function listAccounts(userId, token, offset = 0, limit = 25, options = {}) {
    log("debug", "Listing accounts", { userId, offset, limit, options }, getCallerInfo(), userId);
    sanitizeInput(offset);
    sanitizeInput(limit);
    const params = [];
    const whereClauses = [];
    const isAdminUser = await isAdmin(userId, token);
    const isManagerUser = await isManager(userId, token);
    if (!isAdminUser && !isManagerUser) {
        params.push(userId);
        whereClauses.push(`accounts.user_id = $${params.length}`);
    }
    const filterClauses = buildAccountFilterClauses(
        {
            filterField: options?.filterField,
            filterValue: options?.filterValue,
            filterMin: options?.filterMin,
            filterMax: options?.filterMax,
        },
        params,
    );
    whereClauses.push(...filterClauses);
    const sortConfig = resolveAccountSort(options?.sortField, options?.sortDirection);
    let query = "SELECT accounts.* FROM accounts";
    if (sortConfig.requiresUserJoin) {
        query += " LEFT JOIN users ON users.id = accounts.user_id";
    }
    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    query += ` ORDER BY ${sortConfig.orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit);
    params.push(offset);
    const result = await db.query(query, params);
    log("debug", "Accounts listed", { userId, rowCount: result.rowCount, scoped: !(isAdminUser || isManagerUser) }, getCallerInfo(), userId);
    return result;
}

async function getAccountCounts(userId, token, options = {}) {
    log("debug", "Fetching account counts", { userId, options }, getCallerInfo(), userId);
    sanitizeInput(userId);
    sanitizeInput(token);
    const params = [];
    const whereClauses = [];
    const isAdminUser = await isAdmin(userId, token);
    const isManagerUser = await isManager(userId, token);
    if (!isAdminUser && !isManagerUser) {
        params.push(userId);
        whereClauses.push(`accounts.user_id = $${params.length}`);
    }
    const filterClauses = buildAccountFilterClauses(
        {
            filterField: options?.filterField,
            filterValue: options?.filterValue,
            filterMin: options?.filterMin,
            filterMax: options?.filterMax,
        },
        params,
    );
    whereClauses.push(...filterClauses);
    let query = "SELECT COUNT(*) AS total_accounts FROM accounts";
    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    const result = await db.query(query, params);
    log("debug", "Account counts fetched", { userId, total: result.rows[0]?.total_accounts, scoped: !(isAdminUser || isManagerUser) }, getCallerInfo(), userId);
    return result.rows[0];
}

async function createAccount(ownerId, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, totalDebits, totalCredits, accountOrder, statementType, comments) {
    log("info", "Creating account", { ownerId, accountName, accountCategory, accountSubcategory, accountOrder, statementType }, getCallerInfo(), ownerId);
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
        log("error", "Invalid statement type for account creation", { ownerId, statementType }, getCallerInfo(), ownerId);
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
        log("info", "Account created", { ownerId, accountId: result.rows[0]?.id, accountNumber }, getCallerInfo(), ownerId);
        return result.rows[0];
    } catch (error) {
        log("error", "Account creation error", { ownerId, accountName, error: error.message }, getCallerInfo(), ownerId);
        throw error;
    }
}

async function generateNewAccountNumber(accountCategory, accountSubcategory, accountOrder) {
    const orderValue = Number.parseInt(accountOrder ?? 0, 10);
    if (!Number.isFinite(orderValue)) {
        log("error", "Invalid account order", { accountCategory, accountSubcategory, accountOrder }, getCallerInfo());
        throw new Error(`Invalid account order: ${accountOrder}`);
    }

    const orderCode = String(orderValue).padStart(2, "0");
    if (orderCode.length !== 2) {
        log("error", "Account order out of bounds", { accountCategory, accountSubcategory, accountOrder }, getCallerInfo());
        throw new Error(`Account order must be between 0 and 99. Received: ${accountOrder}`);
    }

    return db.transaction(async (client) => {
        log("debug", "Generating new account number", { accountCategory, accountSubcategory, accountOrder: orderValue }, getCallerInfo());
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
            log("error", "Account suffix overflow", { accountCategory, accountSubcategory, accountOrder: orderValue }, getCallerInfo());
            throw new Error(`Account suffix overflow for ${accountCategory} / ${accountSubcategory} / order ${orderValue}`);
        }

        const suffixCode = String(nextSuffix).padStart(2, "0");
        log("debug", "Account number generated", { accountNumber: `${base}${suffixCode}`, categoryId: category.id, subcategoryId: subcategory.id }, getCallerInfo());
        return {
            accountNumber: `${base}${suffixCode}`,
            categoryId: category.id,
            subcategoryId: subcategory.id,
        };
    });
}

async function listAccountCategories() {
    log("debug", "Listing account categories", {}, getCallerInfo());
    let query = "SELECT * FROM account_categories ORDER BY name ASC";
    const result = {};
    result.categories = (await db.query(query)).rows;
    query = "SELECT * FROM account_subcategories ORDER BY account_category_id ASC, order_index ASC, name ASC";
    result.subcategories = (await db.query(query)).rows;
    log("debug", "Account categories listed", { categoryCount: result.categories.length, subcategoryCount: result.subcategories.length }, getCallerInfo());
    return result;
}

async function updateAccountField({ account_id, field, value }) {
    log("info", "Updating account field", { account_id, field }, getCallerInfo());
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
        log("warn", "Attempt to update disallowed account field", { account_id, field }, getCallerInfo());
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
            log("warn", "Invalid numeric account field value", { account_id, field, value }, getCallerInfo());
            return { success: false, message: numericResult.message };
        }
        resolvedValue = numericResult.value;
    } else if (field === "statement_type") {
        const statementResult = normalizeStatementType(value);
        if (!statementResult.ok) {
            log("warn", "Invalid statement type for account update", { account_id, value }, getCallerInfo());
            return { success: false, message: statementResult.message };
        }
        resolvedValue = statementResult.value;
    } else if (field === "normal_side") {
        const normalResult = normalizeNormalSide(value);
        if (!normalResult.ok) {
            log("warn", "Invalid normal side for account update", { account_id, value }, getCallerInfo());
            return { success: false, message: normalResult.message };
        }
        resolvedValue = normalResult.value;
    }

    let query = `UPDATE accounts SET ${field} = $1 WHERE id = $2 RETURNING *`;
    const params = [resolvedValue, account_id];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        log("warn", "Account not found for update", { account_id, field }, getCallerInfo());
        return {success: false, message: `Account with ID ${account_id} not found.`};
    }
    log("info", "Account field updated", { account_id, field }, getCallerInfo());
    return {success: true, message: "Account updated successfully", account: result.rows[0]};
};

async function deactivateAccount(accountId) {
    if (!await isValidAccountId(accountId)) {
        log("warn", "Attempt to deactivate non-existent account", { accountId }, getCallerInfo());
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    sanitizeInput(accountId);
    const accountRes = await db.query(`SELECT balance FROM accounts WHERE id = $1`, [accountId]);
    const account = accountRes.rows[0];
    if (Number(account.balance) !== 0) {
        log("warn", "Attempt to deactivate account with non-zero balance", { accountId, balance: account.balance }, getCallerInfo());
        throw new Error(`Cannot deactivate account ID ${accountId} because it has a non-zero balance.`);
    }
    const query = `UPDATE accounts SET status = $1 WHERE id = $2 RETURNING *`;
    const params = ['inactive', accountId];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        log("warn", "Account not found for deactivation", { accountId }, getCallerInfo());
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    log("info", "Account deactivated", { accountId }, getCallerInfo());
    return result.rows[0];
}

async function activateAccount(accountId) {
    if (!await isValidAccountId(accountId)) {
        log("warn", "Attempt to activate non-existent account", { accountId }, getCallerInfo());
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    const query = `UPDATE accounts SET status = $1 WHERE id = $2 RETURNING *`;
    const params = ['active', accountId];
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
        log("warn", "Account not found for activation", { accountId }, getCallerInfo());
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    log("info", "Account activated", { accountId }, getCallerInfo());
    return result.rows[0];
}

async function isValidAccountId(accountId) {
    const query = `SELECT id FROM accounts WHERE id = $1`;
    const params = [accountId];
    const result = await db.query(query, params);
    return result.rows.length > 0;
}

async function setAccountStatus(accountId, status) {
    log("info", "Setting account status", { accountId, status }, getCallerInfo());
    sanitizeInput(status);
    sanitizeInput(accountId);
    if (!await isValidAccountId(accountId)) {
        log("warn", "Account not found for status update", { accountId, status }, getCallerInfo());
        throw new Error(`Account with ID ${accountId} not found.`);
    }
    if (status === 'active') {
        return activateAccount(accountId);
    } else if (status === 'inactive') {
        return deactivateAccount(accountId);
    } else {
        log("error", "Invalid account status", { accountId, status }, getCallerInfo());
        throw new Error(`Invalid status: ${status}`);
    }
}

async function addCategory(categoryName, accountNumberPrefix, categoryDescription, initialSubcategoryName, initialSubcategoryDescription) {
    log("info", "Adding account category", { categoryName, accountNumberPrefix, initialSubcategoryName }, getCallerInfo());
    sanitizeInput(categoryName);
    sanitizeInput(accountNumberPrefix);
    sanitizeInput(categoryDescription);
    sanitizeInput(initialSubcategoryName);
    sanitizeInput(initialSubcategoryDescription);
    return db.transaction(async (client) => {
        const categoryCheck = await client.query("SELECT id FROM account_categories WHERE name = $1", [categoryName]);
        if (categoryCheck.rows.length > 0) {
            log("warn", "Account category already exists", { categoryName }, getCallerInfo());
            throw new Error(`Account category with name "${categoryName}" already exists.`);
        }
        const subcategoryCheck = await client.query("SELECT id FROM account_subcategories WHERE name = $1", [initialSubcategoryName]);
        if (subcategoryCheck.rows.length > 0) {
            log("warn", "Account subcategory already exists", { initialSubcategoryName }, getCallerInfo());
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
            log("error", "Category creation failed", { categoryName }, getCallerInfo());
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
            log("error", "Subcategory creation failed", { initialSubcategoryName, categoryId: category.id }, getCallerInfo());
            throw new Error("Subcategory creation failed.");
        }
        log("info", "Account category created", { categoryId: category.id, subcategoryId: subcategoryResult.rows[0]?.id }, getCallerInfo());
        return { category, subcategory: subcategoryResult.rows[0] };
    });
}

async function addSubcategory(subcategoryName, accountCategoryId, orderIndex, subcategoryDescription) {
    log("info", "Adding account subcategory", { subcategoryName, accountCategoryId, orderIndex }, getCallerInfo());
    sanitizeInput(subcategoryName);
    sanitizeInput(accountCategoryId);
    sanitizeInput(orderIndex);
    sanitizeInput(subcategoryDescription);
    return db.transaction(async (client) => {
        const categoryCheck = await client.query("SELECT id FROM account_categories WHERE id = $1", [accountCategoryId]);
        if (categoryCheck.rows.length === 0) {
            log("warn", "Account category not found for subcategory", { accountCategoryId }, getCallerInfo());
            throw new Error(`Account category with ID ${accountCategoryId} does not exist.`);
        }
        const subcategoryCheck = await client.query("SELECT id FROM account_subcategories WHERE name = $1 AND account_category_id = $2", [subcategoryName, accountCategoryId]);
        if (subcategoryCheck.rows.length > 0) {
            log("warn", "Account subcategory already exists for category", { subcategoryName, accountCategoryId }, getCallerInfo());
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
            log("error", "Subcategory creation failed", { subcategoryName, accountCategoryId }, getCallerInfo());
            throw new Error("Subcategory creation failed.");
        }
        log("info", "Account subcategory created", { subcategoryId: result.rows[0]?.id, accountCategoryId }, getCallerInfo());
        return result.rows[0];
    });
}

async function deleteCategory(categoryId) {
    log("info", "Deleting account category", { categoryId }, getCallerInfo());
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
            log("warn", "Cannot delete category with associated accounts", { categoryId }, getCallerInfo());
            throw new Error(`Cannot delete category ID ${categoryId} because it has associated accounts.`);
        }
        await client.query("DELETE FROM account_categories WHERE id = $1", [categoryId]);
        log("info", "Account category deleted", { categoryId }, getCallerInfo());
        return { success: true };
    });
}

async function deleteSubcategory(subcategoryId) {
    log("info", "Deleting account subcategory", { subcategoryId }, getCallerInfo());
    sanitizeInput(subcategoryId);
    return db.transaction(async (client) => {
        const accountCheck = await client.query("SELECT id FROM accounts WHERE account_subcategory_id = $1", [subcategoryId]);
        if (accountCheck.rows.length > 0) {
            log("warn", "Cannot delete subcategory with associated accounts", { subcategoryId }, getCallerInfo());
            throw new Error(`Cannot delete subcategory ID ${subcategoryId} because it has associated accounts.`);
        }
        await client.query("DELETE FROM account_subcategories WHERE id = $1", [subcategoryId]);
        log("info", "Account subcategory deleted", { subcategoryId }, getCallerInfo());
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
