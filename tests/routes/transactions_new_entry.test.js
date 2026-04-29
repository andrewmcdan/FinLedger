/**
 * @fileoverview Route-level tests for POST /api/transactions/new-journal-entry
 * and GET /api/transactions/reference-code-available.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");

const emailCalls = [];
const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

require.cache[emailModulePath] = {
    id: emailModulePath,
    filename: emailModulePath,
    loaded: true,
    exports: {
        sendEmail: async (to, subject, body) => {
            emailCalls.push({ to, subject, body });
            return { accepted: [to], messageId: "test" };
        },
    },
};

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
            trial_balance_lines,
            trial_balance_runs,
            statement_runs,
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

async function insertUser({ username, email, role = "accountant", status = "active" } = {}) {
    const result = await db.query(
        `INSERT INTO users (
            username, email, first_name, last_name, role, status,
            password_hash, password_changed_at, password_expires_at, temp_password
        ) VALUES (
            $1, $2, 'Test', 'User', $3, $4,
            crypt('ValidPass1!', gen_salt('bf')),
            now(), now() + interval '90 days', false
        ) RETURNING id, username, role`,
        [username, email, role, status],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1" } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, now(), now() + interval '1 hour')", [userId, token]);
}

async function seedCategories() {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Assets', 'Assets', '10', 10) ON CONFLICT DO NOTHING");
    const catResult = await db.query("SELECT id FROM account_categories WHERE name = 'Assets'");
    const catId = catResult.rows[0].id;
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10) ON CONFLICT DO NOTHING", [catId]);
    return catId;
}

async function seedAccount({ userId, name = "Cash", normalSide = "debit", accountNumber = 1000 } = {}) {
    const catId = await seedCategories();
    const subResult = await db.query("SELECT id FROM account_subcategories WHERE name = 'Current Assets'");
    const subId = subResult.rows[0].id;

    const result = await db.query(
        `INSERT INTO accounts (
            account_name, account_description, account_number,
            normal_side, account_category_id, account_subcategory_id,
            balance, initial_balance, total_debits, total_credits,
            account_order, statement_type, comment, user_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 10, 'BS', '', $7, 'active')
        RETURNING id`,
        [name, name, accountNumber, normalSide, catId, subId, userId],
    );
    return result.rows[0];
}

function authHeaders({ userId, token }) {
    return {
        authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

/**
 * Build a multipart/form-data Buffer with text fields and optional file attachments.
 */
function buildMultipart(fields = {}, files = []) {
    const boundary = `----TestFormBoundary${Date.now()}`;
    const parts = [];

    for (const [name, value] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="${name}"\r\n\r\n` + `${value}\r\n`));
    }

    for (const { name, filename, content, contentType = "text/plain" } of files) {
        const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;
        parts.push(Buffer.concat([Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` + `Content-Type: ${contentType}\r\n\r\n`), contentBuffer, Buffer.from("\r\n")]));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function requestRaw({ port, method = "POST", path: reqPath, headers = {}, body }) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method,
                headers: {
                    "Content-Length": body ? body.length : 0,
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
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = null;
                    }
                    resolve({ statusCode: res.statusCode, body: parsed, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

function requestJson({ port, method = "GET", path: reqPath, headers = {}, body = null }) {
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
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = null;
                    }
                    resolve({ statusCode: res.statusCode, body: parsed });
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
    emailCalls.length = 0;
});

// ---- reference-code-available ----

test("GET reference-code-available returns available=true for an unused code", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_refcode_1", email: "txn_new_acct_refcode_1@example.com" });
    const token = "txn-refcode-token-1";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            path: "/api/transactions/reference-code-available?reference_code=JE-UNIQUE-001",
            headers: authHeaders({ userId: accountant.id, token }),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.is_available, true);
        assert.equal(res.body.reference_code, "JE-UNIQUE-001");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("GET reference-code-available returns 400 ERR_PLEASE_FILL_ALL_FIELDS when reference_code is missing", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_refcode_2", email: "txn_new_acct_refcode_2@example.com" });
    const token = "txn-refcode-token-2";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            path: "/api/transactions/reference-code-available",
            headers: authHeaders({ userId: accountant.id, token }),
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_PLEASE_FILL_ALL_FIELDS");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("GET reference-code-available is blocked for administrator users", async () => {
    const admin = await insertUser({ username: "txn_new_admin_refcode", email: "txn_new_admin_refcode@example.com", role: "administrator" });
    const token = "txn-admin-refcode-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            path: "/api/transactions/reference-code-available?reference_code=JE-ADMIN-001",
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.errorCode, "ERR_FORBIDDEN");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

// ---- new-journal-entry ----

test("POST new-journal-entry returns 403 ERR_FORBIDDEN for administrator users", async () => {
    const admin = await insertUser({ username: "txn_new_admin_1", email: "txn_new_admin_1@example.com", role: "administrator" });
    const token = "txn-admin-token-1";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const { body: multipartBody, contentType } = buildMultipart({ payload: "{}" });
        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: admin.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.errorCode, "ERR_FORBIDDEN");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry returns 400 ERR_PLEASE_FILL_ALL_FIELDS when payload field is absent", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_1", email: "txn_new_acct_1@example.com" });
    const token = "txn-acct-token-1";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        // Send multipart with no payload field and no file
        const { body: multipartBody, contentType } = buildMultipart({});
        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_PLEASE_FILL_ALL_FIELDS");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry returns 400 ERR_NO_FILE_UPLOADED when payload is present but no files are attached", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_2", email: "txn_new_acct_2@example.com" });
    const token = "txn-acct-token-2";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const payload = JSON.stringify({ description: "Test entry", lines: [], journal_type: "general" });
        // No files — only the payload text field
        const { body: multipartBody, contentType } = buildMultipart({ payload });
        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_NO_FILE_UPLOADED");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry returns 400 ERR_INVALID_SELECTION when payload is not valid JSON", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_3", email: "txn_new_acct_3@example.com" });
    const token = "txn-acct-token-3";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const { body: multipartBody, contentType } = buildMultipart({ payload: "not-valid-json{{" }, [{ name: "documents", filename: "test.txt", content: "test content", contentType: "text/plain" }]);
        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_INVALID_SELECTION");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry creates a journal entry with balanced lines and a document", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_4", email: "txn_new_acct_4@example.com" });
    const manager = await insertUser({ username: "txn_new_mgr_4", email: "txn_new_mgr_4@example.com", role: "manager" });
    const token = "txn-acct-token-4";
    await insertLoggedInUser({ userId: accountant.id, token });
    await insertLoggedInUser({ userId: manager.id, token: "txn-mgr-token-4" });

    const cashAccount = await seedAccount({ userId: accountant.id, name: "Cash TxnNew4", normalSide: "debit", accountNumber: 1004 });
    const revenueAccount = await seedAccount({ userId: accountant.id, name: "Revenue TxnNew4", normalSide: "credit", accountNumber: 2004 });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const payload = JSON.stringify({
            description: "Test balanced journal entry",
            journal_type: "general",
            reference_code: "JE-TEST-CREATE-001",
            entry_date: "2026-01-15",
            lines: [
                { account_id: cashAccount.id, dc: "debit", amount: 100.0, description: "Cash debit" },
                { account_id: revenueAccount.id, dc: "credit", amount: 100.0, description: "Revenue credit" },
            ],
            documents: [{ upload_index: 0, title: "Test Receipt" }],
        });

        const { body: multipartBody, contentType } = buildMultipart({ payload }, [{ name: "documents", filename: "receipt.txt", content: "receipt data", contentType: "text/plain" }]);

        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });

        assert.equal(res.statusCode, 200);
        assert.ok(res.body?.journal_entry, "response should contain journal_entry");
        assert.equal(res.body.journal_entry.status, "pending");
        assert.equal(res.body.journal_entry.description, "Test balanced journal entry");
        assert.ok(Array.isArray(res.body.uploaded_documents));
        assert.equal(res.body.uploaded_documents.length, 1);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry returns 400 ERR_JOURNAL_ENTRY_NOT_BALANCED for unbalanced lines", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_5", email: "txn_new_acct_5@example.com" });
    const token = "txn-acct-token-5";
    await insertLoggedInUser({ userId: accountant.id, token });

    const cashAccount = await seedAccount({ userId: accountant.id, name: "Cash TxnNew5" });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const payload = JSON.stringify({
            description: "Unbalanced journal entry",
            journal_type: "general",
            lines: [{ account_id: cashAccount.id, dc: "debit", amount: 200.0, description: "Debit only" }],
            documents: [{ upload_index: 0, title: "Test" }],
        });

        const { body: multipartBody, contentType } = buildMultipart({ payload }, [{ name: "documents", filename: "doc.txt", content: "content", contentType: "text/plain" }]);

        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_JOURNAL_ENTRY_NOT_BALANCED");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry returns 400 ERR_JOURNAL_DUPLICATE_ACCOUNT when an account is reused", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_5_dup", email: "txn_new_acct_5_dup@example.com" });
    const token = "txn-acct-token-5-dup";
    await insertLoggedInUser({ userId: accountant.id, token });

    const cashAccount = await seedAccount({ userId: accountant.id, name: "Cash TxnNew5 Dup", normalSide: "debit", accountNumber: 10055 });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const payload = JSON.stringify({
            description: "Duplicate account journal entry",
            journal_type: "general",
            lines: [
                { account_id: cashAccount.id, dc: "debit", amount: 200.0, description: "Debit line" },
                { account_id: cashAccount.id, dc: "credit", amount: 200.0, description: "Credit line" },
            ],
            documents: [{ upload_index: 0, title: "Test" }],
        });

        const { body: multipartBody, contentType } = buildMultipart({ payload }, [{ name: "documents", filename: "dup.txt", content: "content", contentType: "text/plain" }]);

        const res = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: {
                ...authHeaders({ userId: accountant.id, token }),
                "Content-Type": contentType,
            },
            body: multipartBody,
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.errorCode, "ERR_JOURNAL_DUPLICATE_ACCOUNT");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("POST new-journal-entry rejects duplicate reference_code", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_6", email: "txn_new_acct_6@example.com" });
    const token = "txn-acct-token-6";
    await insertLoggedInUser({ userId: accountant.id, token });

    const cashAccount = await seedAccount({ userId: accountant.id, name: "Cash TxnNew6", normalSide: "debit", accountNumber: 1006 });
    const revenueAccount = await seedAccount({ userId: accountant.id, name: "Revenue TxnNew6", normalSide: "credit", accountNumber: 2006 });

    const makePayload = (refCode) =>
        JSON.stringify({
            description: "Dup ref test",
            journal_type: "general",
            reference_code: refCode,
            lines: [
                { account_id: cashAccount.id, dc: "debit", amount: 50.0 },
                { account_id: revenueAccount.id, dc: "credit", amount: 50.0 },
            ],
            documents: [{ upload_index: 0, title: "Doc" }],
        });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        // First submission — should succeed
        const { body: body1, contentType: ct1 } = buildMultipart({ payload: makePayload("JE-DUP-001") }, [{ name: "documents", filename: "d1.txt", content: "d1", contentType: "text/plain" }]);
        const res1 = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: { ...authHeaders({ userId: accountant.id, token }), "Content-Type": ct1 },
            body: body1,
        });
        assert.equal(res1.statusCode, 200);

        // Second submission with same reference_code — should fail
        const { body: body2, contentType: ct2 } = buildMultipart({ payload: makePayload("JE-DUP-001") }, [{ name: "documents", filename: "d2.txt", content: "d2", contentType: "text/plain" }]);
        const res2 = await requestRaw({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: { ...authHeaders({ userId: accountant.id, token }), "Content-Type": ct2 },
            body: body2,
        });
        assert.equal(res2.statusCode, 400);
        assert.equal(res2.body.errorCode, "ERR_JOURNAL_REFERENCE_CODE_NOT_AVAILABLE");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("GET reference-code-available returns available=false when code already exists", async () => {
    const accountant = await insertUser({ username: "txn_new_acct_refcode_3", email: "txn_new_acct_refcode_3@example.com" });
    const token = "txn-refcode-token-3";
    await insertLoggedInUser({ userId: accountant.id, token });

    // Insert a journal entry with a known reference code directly
    await db.query(
        `INSERT INTO journal_entries (created_by, updated_by, description, status, journal_type, reference_code, entry_date, total_debits, total_credits)
         VALUES ($1, $1, 'existing entry', 'pending', 'general', 'JE-EXISTING-001', now(), 0, 0)`,
        [accountant.id],
    );

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            path: "/api/transactions/reference-code-available?reference_code=JE-EXISTING-001",
            headers: authHeaders({ userId: accountant.id, token }),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.is_available, false);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
