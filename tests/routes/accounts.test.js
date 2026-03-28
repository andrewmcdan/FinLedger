/**
 * @fileoverview Route-level integration tests for account and account-audit access.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");
const accountsController = require("../../src/controllers/accounts");
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
        ) RETURNING id, username, email, role`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
}

async function seedCategories() {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Assets', 'Assets', '10', 10)");
    const categoryResult = await db.query("SELECT id FROM account_categories WHERE name = 'Assets'");
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10)", [categoryResult.rows[0].id]);
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
    await seedCategories();
});

test("administrator can create accounts and manager/accountant can view account lists and counts", async () => {
    const admin = await insertUser({ username: "acct_admin_route_1", email: "acct_admin_route_1@example.com", role: "administrator" });
    const manager = await insertUser({ username: "acct_manager_route_1", email: "acct_manager_route_1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_accountant_route_1", email: "acct_accountant_route_1@example.com", role: "accountant" });
    const adminToken = "accounts-admin-token-1";
    const managerToken = "accounts-manager-token-1";
    const accountantToken = "accounts-accountant-token-1";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const createResponse = await requestJson({
            port,
            method: "POST",
            path: "/api/accounts/create",
            headers: authHeaders({ userId: admin.id, token: adminToken }),
            body: {
                accountName: "Route Test Cash",
                accountDescription: "Route-level account creation",
                normalSide: "debit",
                accountCategory: "Assets",
                accountSubcategory: "Current Assets",
                balance: 0,
                initialBalance: 0,
                total_debits: 0,
                total_credits: 0,
                accountOrder: 10,
                statementType: "Balance Sheet",
                comments: "created by admin",
                accountOwner: accountant.id,
            },
        });

        assert.equal(createResponse.statusCode, 201);
        assert.equal(createResponse.body.account_name, "Route Test Cash");

        const managerListResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/accounts/list/0/25",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(managerListResponse.statusCode, 200);
        assert.equal(managerListResponse.body.length, 1);
        assert.equal(managerListResponse.body[0].account_name, "Route Test Cash");

        const accountantListResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/accounts/list/0/25",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
        });
        assert.equal(accountantListResponse.statusCode, 200);
        assert.equal(accountantListResponse.body.length, 1);
        assert.equal(accountantListResponse.body[0].account_name, "Route Test Cash");

        const managerCountResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/accounts/account_count",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(managerCountResponse.statusCode, 200);
        assert.equal(Number(managerCountResponse.body.total_accounts), 1);

        const accountantCountResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/accounts/account_count",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
        });
        assert.equal(accountantCountResponse.statusCode, 200);
        assert.equal(Number(accountantCountResponse.body.total_accounts), 1);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("manager and accountant cannot create, update, or deactivate accounts", async () => {
    const admin = await insertUser({ username: "acct_admin_route_2", email: "acct_admin_route_2@example.com", role: "administrator" });
    const manager = await insertUser({ username: "acct_manager_route_2", email: "acct_manager_route_2@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_accountant_route_2", email: "acct_accountant_route_2@example.com", role: "accountant" });
    const adminToken = "accounts-admin-token-2";
    const managerToken = "accounts-manager-token-2";
    const accountantToken = "accounts-accountant-token-2";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const createdAccount = await accountsController.createAccount(
        admin.id,
        "Protected Route Account",
        "Protected route account",
        "debit",
        "Assets",
        "Current Assets",
        0,
        0,
        0,
        0,
        20,
        "BS",
        "protected",
        admin.id,
    );

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const createPayload = {
            accountName: "Forbidden Account",
            accountDescription: "Forbidden route create",
            normalSide: "debit",
            accountCategory: "Assets",
            accountSubcategory: "Current Assets",
            balance: 0,
            initialBalance: 0,
            total_debits: 0,
            total_credits: 0,
            accountOrder: 30,
            statementType: "Balance Sheet",
            comments: "",
            accountOwner: manager.id,
        };
        const updatePayload = {
            account_id: createdAccount.id,
            field: "comment",
            value: "changed by non-admin",
        };
        const deactivatePayload = {
            account_id: createdAccount.id,
            is_active: false,
        };

        for (const roleCase of [
            { user: manager, token: managerToken },
            { user: accountant, token: accountantToken },
        ]) {
            const createResponse = await requestJson({
                port,
                method: "POST",
                path: "/api/accounts/create",
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
                body: createPayload,
            });
            assert.equal(createResponse.statusCode, 403);
            assert.equal(createResponse.body.errorCode, "ERR_FORBIDDEN_ADMIN_CREATE_ACCOUNTS");

            const updateResponse = await requestJson({
                port,
                method: "POST",
                path: "/api/accounts/update-account-field",
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
                body: updatePayload,
            });
            assert.equal(updateResponse.statusCode, 403);
            assert.equal(updateResponse.body.errorCode, "ERR_FORBIDDEN_ADMIN_UPDATE_ACCOUNTS");

            const deactivateResponse = await requestJson({
                port,
                method: "POST",
                path: "/api/accounts/set-account-status",
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
                body: deactivatePayload,
            });
            assert.equal(deactivateResponse.statusCode, 403);
            assert.equal(deactivateResponse.body.errorCode, "ERR_FORBIDDEN_ADMIN_SET_ACCOUNT_STATUS");
        }
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("manager and accountant can view account audit history", async () => {
    const admin = await insertUser({ username: "acct_admin_route_3", email: "acct_admin_route_3@example.com", role: "administrator" });
    const manager = await insertUser({ username: "acct_manager_route_3", email: "acct_manager_route_3@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_accountant_route_3", email: "acct_accountant_route_3@example.com", role: "accountant" });
    const adminToken = "accounts-admin-token-3";
    const managerToken = "accounts-manager-token-3";
    const accountantToken = "accounts-accountant-token-3";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const created = await accountsController.createAccount(
        admin.id,
        "Audited Route Account",
        "Audited route account",
        "debit",
        "Assets",
        "Current Assets",
        0,
        0,
        0,
        0,
        40,
        "BS",
        "initial audit comment",
        admin.id,
    );

    const updateResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "updated audit comment",
        user_id: admin.id,
    });
    assert.equal(updateResult.success, true);

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        for (const roleCase of [
            { user: manager, token: managerToken },
            { user: accountant, token: accountantToken },
        ]) {
            const auditResponse = await requestJson({
                port,
                method: "GET",
                path: `/api/audit-logs/entity/accounts/${created.id}?limit=10`,
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
            });

            assert.equal(auditResponse.statusCode, 200);
            assert.ok(Array.isArray(auditResponse.body.audit_logs));
            assert.ok(auditResponse.body.audit_logs.length >= 2);

            const updateAudit = auditResponse.body.audit_logs.find((row) => row.action === "update");
            assert.ok(updateAudit);
            assert.equal(String(updateAudit.changed_by), String(admin.id));
            assert.equal(updateAudit.b_image.comment, "initial audit comment");
            assert.equal(updateAudit.a_image.comment, "updated audit comment");
        }
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("manager and accountant can open the audit page and run filtered account audit reports", async () => {
    const admin = await insertUser({ username: "acct_admin_route_4", email: "acct_admin_route_4@example.com", role: "administrator" });
    const manager = await insertUser({ username: "acct_manager_route_4", email: "acct_manager_route_4@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_accountant_route_4", email: "acct_accountant_route_4@example.com", role: "accountant" });
    const adminToken = "accounts-admin-token-4";
    const managerToken = "accounts-manager-token-4";
    const accountantToken = "accounts-accountant-token-4";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const created = await accountsController.createAccount(
        admin.id,
        "Audit Report Route Account",
        "Audit report route account",
        "debit",
        "Assets",
        "Current Assets",
        0,
        0,
        0,
        0,
        50,
        "BS",
        "initial report comment",
        admin.id,
    );

    const updateResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "updated report comment",
        user_id: admin.id,
    });
    assert.equal(updateResult.success, true);

    const filteredAuditReportQuery = new URLSearchParams({
        event_type: "accounts_update",
        entity_type: "accounts",
        entity_id: String(created.id),
        changed_by: String(admin.id),
        start_at: "2000-01-01T00:00:00.000",
        end_at: "2100-01-01T23:59:59.999",
        limit: "10",
        offset: "0",
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        for (const roleCase of [
            { user: manager, token: managerToken },
            { user: accountant, token: accountantToken },
        ]) {
            const pageResponse = await requestJson({
                port,
                method: "GET",
                path: "/pages/audit.html",
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
            });
            assert.equal(pageResponse.statusCode, 200);
            assert.match(pageResponse.rawBody, /Audit Reports/);
            assert.match(pageResponse.rawBody, /Record Type/);
            assert.match(pageResponse.rawBody, /Event Type/);

            const reportResponse = await requestJson({
                port,
                method: "GET",
                path: `/api/audit-logs?${filteredAuditReportQuery.toString()}`,
                headers: authHeaders({ userId: roleCase.user.id, token: roleCase.token }),
            });
            assert.equal(reportResponse.statusCode, 200);
            assert.ok(Array.isArray(reportResponse.body.audit_logs));
            assert.equal(reportResponse.body.audit_logs.length, 1);
            assert.ok(reportResponse.body.audit_logs.every((row) => row.event_type === "accounts_update"));
            assert.ok(reportResponse.body.audit_logs.every((row) => row.entity_type === "accounts"));
            assert.ok(reportResponse.body.audit_logs.every((row) => String(row.entity_id) === String(created.id)));
            assert.ok(reportResponse.body.audit_logs.every((row) => String(row.changed_by) === String(admin.id)));
            assert.ok(reportResponse.body.audit_logs.every((row) => row.action === "update"));
        }
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
