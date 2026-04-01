/**
 * @fileoverview Direct tests for src/middleware/auth.js behavior.
 * Verifies public-path bypass, header validation, session checks,
 * temp-password blocking, and session-expiry headers.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");
const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

require.cache[emailModulePath] = {
    id: emailModulePath,
    filename: emailModulePath,
    loaded: true,
    exports: {
        sendEmail: async () => ({ accepted: [], messageId: "test" }),
        sendTemplatedEmail: async () => ({ accepted: [], messageId: "test" }),
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

async function insertUser({ username, email, role = "accountant", status = "active", tempPassword = false } = {}) {
    const result = await db.query(
        `INSERT INTO users (
            username, email, first_name, last_name, role, status,
            password_hash, password_changed_at, password_expires_at, temp_password
        ) VALUES (
            $1, $2, 'Test', 'User', $3, $4,
            crypt('ValidPass1!', gen_salt('bf')),
            now(), now() + interval '90 days', $5
        ) RETURNING id`,
        [username, email, role, status, tempPassword],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token, logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query(
        "INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, now(), $3)",
        [userId, token, logoutAt],
    );
}

function request({ port, method = "GET", path: reqPath, headers = {}, body = null }) {
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
                res.on("data", (chunk) => { data += chunk; });
                res.on("end", () => {
                    let parsed = null;
                    try { parsed = JSON.parse(data); } catch { parsed = null; }
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
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

test("public paths bypass authentication", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const root = await request({ port, path: "/" });
        assert.notEqual(root.statusCode, 401);

        const status = await request({ port, path: "/api/auth/status" });
        assert.notEqual(status.statusCode, 401);

        const securityQList = await request({ port, path: "/api/users/security-questions-list" });
        assert.notEqual(securityQList.statusCode, 401);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("protected endpoint returns 401 ERR_MISSING_AUTH_HEADER when Authorization header is absent", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({ port, path: "/api/accounts/account_count" });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.errorCode, "ERR_MISSING_AUTH_HEADER");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("protected endpoint returns 401 ERR_INVALID_AUTH_HEADER when scheme is not Bearer", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/api/accounts/account_count",
            headers: { authorization: "Basic dXNlcjpwYXNz" },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.errorCode, "ERR_INVALID_AUTH_HEADER");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("protected endpoint returns 401 ERR_MISSING_USER_ID_HEADER when X-User-Id is absent", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/api/accounts/account_count",
            headers: { authorization: "Bearer some-token" },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.errorCode, "ERR_MISSING_USER_ID_HEADER");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("protected endpoint returns 401 ERR_INVALID_OR_EXPIRED_TOKEN when token has no matching session", async () => {
    const user = await insertUser({ username: "auth_mw_notoken", email: "auth_mw_notoken@example.com" });
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/api/accounts/account_count",
            headers: {
                authorization: "Bearer does-not-exist-in-sessions",
                "X-User-Id": String(user.id),
            },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.errorCode, "ERR_INVALID_OR_EXPIRED_TOKEN");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("authenticated request sets X-Session-Expires-At and X-Session-Expires-In response headers", async () => {
    const user = await insertUser({ username: "auth_mw_headers", email: "auth_mw_headers@example.com" });
    const token = "auth-mw-session-headers-token";
    const logoutAt = new Date(Date.now() + 30 * 60 * 1000);
    await insertLoggedInUser({ userId: user.id, token, logoutAt });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/api/accounts/account_count",
            headers: {
                authorization: `Bearer ${token}`,
                "X-User-Id": String(user.id),
            },
        });
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers["x-session-expires-at"], "X-Session-Expires-At should be present");
        assert.ok(res.headers["x-session-expires-in"] !== undefined, "X-Session-Expires-In should be present");
        const expiresIn = Number(res.headers["x-session-expires-in"]);
        assert.ok(Number.isFinite(expiresIn) && expiresIn >= 0, `X-Session-Expires-In should be a non-negative number, got ${expiresIn}`);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("user with temp_password is blocked from non-whitelisted paths with 403 ERR_TEMP_PASSWORD_CHANGE_REQUIRED", async () => {
    const user = await insertUser({ username: "auth_mw_temppw", email: "auth_mw_temppw@example.com", tempPassword: true });
    const token = "auth-mw-temp-token";
    await insertLoggedInUser({ userId: user.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/api/accounts/account_count",
            headers: {
                authorization: `Bearer ${token}`,
                "X-User-Id": String(user.id),
            },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.errorCode, "ERR_TEMP_PASSWORD_CHANGE_REQUIRED");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("user with temp_password can access /api/users/change-temp-password", async () => {
    const user = await insertUser({ username: "auth_mw_temppw2", email: "auth_mw_temppw2@example.com", tempPassword: true });
    const token = "auth-mw-temp-token-2";
    await insertLoggedInUser({ userId: user.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        // We expect NOT 403 — the request may fail for other reasons (missing fields etc.)
        // but it must pass the temp-password gate.
        const res = await request({
            port,
            method: "POST",
            path: "/api/users/change-temp-password",
            headers: {
                authorization: `Bearer ${token}`,
                "X-User-Id": String(user.id),
            },
            body: {},
        });
        assert.notEqual(res.body?.errorCode, "ERR_TEMP_PASSWORD_CHANGE_REQUIRED");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("page route returns 401 ERR_NOT_LOGGED_IN for unauthenticated access to /pages/ path", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await request({
            port,
            path: "/pages/dashboard.html",
            headers: {
                authorization: "Bearer fake-token",
                "X-User-Id": "1",
            },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.errorCode, "ERR_NOT_LOGGED_IN");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
