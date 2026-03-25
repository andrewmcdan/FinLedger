/**
 * @fileoverview Route-level integration tests for src/routes/adjustments.js (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

delete require.cache[serverModulePath];
const app = require(serverModulePath);

async function resetDb() {
    await db.query(`
        TRUNCATE TABLE
            password_history,
            password_expiry_email_tracking,
            logged_in_users,
            adjustment_lines,
            adjustment_metadata,
            journal_entry_line_documents,
            journal_entry_documents,
            ledger_entries,
            journal_entry_lines,
            journal_entries,
            account_metadata_edits,
            account_audits,
            documents,
            audit_logs,
            app_logs,
            accounts,
            account_subcategories,
            account_categories,
            users
        RESTART IDENTITY CASCADE
    `);
}

async function insertUser({ username, email, firstName = "Test", lastName = "User", role = "accountant", status = "active", password = "ValidPass1!" } = {}) {
    const result = await db.query(
        `INSERT INTO users (
            username,
            email,
            first_name,
            last_name,
            role,
            status,
            password_hash,
            password_changed_at,
            password_expires_at,
            temp_password
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false
        ) RETURNING id, email, username, role`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
}

async function seedCategories() {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Assets', 'Assets', '10', 10)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Liabilities', 'Liabilities', '20', 20)");

    const assetsCategory = await db.query("SELECT id FROM account_categories WHERE name = 'Assets'");
    const liabilitiesCategory = await db.query("SELECT id FROM account_categories WHERE name = 'Liabilities'");

    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10)", [assetsCategory.rows[0].id]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Liabilities', 'Current Liabilities', 10)", [liabilitiesCategory.rows[0].id]);

    return {
        assetsCategoryId: assetsCategory.rows[0].id,
        liabilitiesCategoryId: liabilitiesCategory.rows[0].id,
        assetsSubcategoryId: (await db.query("SELECT id FROM account_subcategories WHERE name = 'Current Assets'")).rows[0].id,
        liabilitiesSubcategoryId: (await db.query("SELECT id FROM account_subcategories WHERE name = 'Current Liabilities'")).rows[0].id,
    };
}

async function insertAccount({ userId, accountName, accountNumber, normalSide, accountCategoryId, accountSubcategoryId, accountOrder }) {
    const result = await db.query(
        `INSERT INTO accounts (
            user_id,
            account_name,
            account_number,
            account_description,
            normal_side,
            initial_balance,
            total_debits,
            total_credits,
            balance,
            account_order,
            statement_type,
            status,
            account_category_id,
            account_subcategory_id
        ) VALUES (
            $1, $2, $3, $4, $5,
            0, 0, 0, 0,
            $6,
            'BS',
            'active',
            $7,
            $8
        ) RETURNING id`,
        [userId, accountName, accountNumber, `${accountName} description`, normalSide, accountOrder, accountCategoryId, accountSubcategoryId],
    );
    return result.rows[0];
}

function authHeaders({ userId, token }) {
    return {
        authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

function requestJson({ port, method, path: reqPath, headers = {}, body = null }) {
    const payload = body === null ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method,
                headers: {
                    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                    ...headers,
                },
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    let parsed = null;
                    if (data) {
                        try {
                            parsed = JSON.parse(data);
                        } catch {
                            parsed = null;
                        }
                    }
                    resolve({ statusCode: res.statusCode, body: parsed, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

test.beforeEach(async () => {
    await resetDb();
});

test("accountant can create and list a pending adjustment entry", async () => {
    const accountant = await insertUser({ username: "acct_adjust_1", email: "acct_adjust_1@example.com", role: "accountant" });
    const token = "acct-adjust-token-1";
    await insertLoggedInUser({ userId: accountant.id, token });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Prepaid Insurance",
        accountNumber: 1000000201,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Insurance Expense",
        accountNumber: 2000000201,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const createResponse = await requestJson({
            port,
            method: "POST",
            path: "/api/adjustments",
            headers: authHeaders({ userId: accountant.id, token }),
            body: {
                adjustment_reason: "prepaid_expense",
                period_end_date: "2026-03-31",
                entry_date: "2026-03-31",
                description: "Monthly prepaid insurance adjustment",
                notes: "Recognize one month expense",
                lines: [
                    { account_id: debitAccount.id, dc: "debit", amount: 250, line_description: "Record expense" },
                    { account_id: creditAccount.id, dc: "credit", amount: 250, line_description: "Reduce prepaid" },
                ],
            },
        });

        assert.equal(createResponse.statusCode, 200);
        assert.equal(createResponse.body.adjustment_entry.status, "pending");
        assert.equal(createResponse.body.adjustment_entry.journal_type, "adjusting");
        assert.equal(createResponse.body.lines.length, 2);

        const listResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/adjustments?status=pending&search=prepaid",
            headers: authHeaders({ userId: accountant.id, token }),
        });

        assert.equal(listResponse.statusCode, 200);
        assert.equal(listResponse.body.adjustment_entries.length, 1);
        assert.equal(listResponse.body.adjustment_entries[0].adjustment_reason, "prepaid_expense");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("manager can approve an adjustment and ledger rows are posted", async () => {
    const manager = await insertUser({ username: "manager_adjust_1", email: "manager_adjust_1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_adjust_2", email: "acct_adjust_2@example.com", role: "accountant" });
    const managerToken = "manager-adjust-token-1";
    const accountantToken = "acct-adjust-token-2";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Depreciation Expense",
        accountNumber: 1000000202,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Accumulated Depreciation",
        accountNumber: 2000000202,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const createResponse = await requestJson({
            port,
            method: "POST",
            path: "/api/adjustments",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
            body: {
                adjustment_reason: "depreciation",
                period_end_date: "2026-03-31",
                description: "Monthly depreciation adjustment",
                lines: [
                    { account_id: debitAccount.id, dc: "debit", amount: 100 },
                    { account_id: creditAccount.id, dc: "credit", amount: 100 },
                ],
            },
        });

        assert.equal(createResponse.statusCode, 200);
        const journalEntryId = createResponse.body.adjustment_entry.id;

        const approveResponse = await requestJson({
            port,
            method: "PATCH",
            path: `/api/adjustments/${journalEntryId}/approve`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
            body: { manager_comment: "Approved for month-end close" },
        });

        assert.equal(approveResponse.statusCode, 200);
        assert.equal(approveResponse.body.adjustment_entry.status, "approved");

        const postedRows = await db.query("SELECT COUNT(*)::INT AS total FROM ledger_entries WHERE journal_entry_id = $1", [journalEntryId]);
        assert.equal(postedRows.rows[0].total, 2);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("non-manager cannot approve adjustments", async () => {
    const accountant = await insertUser({ username: "acct_adjust_3", email: "acct_adjust_3@example.com", role: "accountant" });
    const token = "acct-adjust-token-3";
    await insertLoggedInUser({ userId: accountant.id, token });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Accrued Expense",
        accountNumber: 1000000203,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Accrued Liability",
        accountNumber: 2000000203,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const createResponse = await requestJson({
            port,
            method: "POST",
            path: "/api/adjustments",
            headers: authHeaders({ userId: accountant.id, token }),
            body: {
                adjustment_reason: "accrual",
                period_end_date: "2026-03-31",
                description: "Accrual adjustment",
                lines: [
                    { account_id: debitAccount.id, dc: "debit", amount: 75 },
                    { account_id: creditAccount.id, dc: "credit", amount: 75 },
                ],
            },
        });

        assert.equal(createResponse.statusCode, 200);
        const journalEntryId = createResponse.body.adjustment_entry.id;

        const approveResponse = await requestJson({
            port,
            method: "PATCH",
            path: `/api/adjustments/${journalEntryId}/approve`,
            headers: authHeaders({ userId: accountant.id, token }),
            body: { manager_comment: "Self approval should fail" },
        });

        assert.equal(approveResponse.statusCode, 403);
        assert.equal(approveResponse.body.errorCode, "ERR_FORBIDDEN_MANAGER_APPROVAL_REQUIRED");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
