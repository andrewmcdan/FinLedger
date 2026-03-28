/**
 * @fileoverview Route-level tests for src/routes/auth.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const db = require("../../src/db/db");
const authRouter = require("../../src/routes/auth");

function createApp() {
    const app = express();
    app.use("/api/auth", authRouter);
    return app;
}

async function request({ app, method, path: reqPath, headers = {}, body = null }) {
    const payload = body === null ? null : JSON.stringify(body);
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port: server.address().port,
                path: reqPath,
                method,
                headers: {
                    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                    ...headers,
                },
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(Buffer.from(chunk));
                });
                res.on("end", () => {
                    const rawBody = Buffer.concat(chunks);
                    const text = rawBody.toString("utf8");
                    let parsed = null;
                    try {
                        parsed = JSON.parse(text);
                    } catch {
                        parsed = null;
                    }
                    server.close(() => {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            rawBody,
                            text,
                            body: parsed,
                        });
                    });
                });
            },
        );

        req.on("error", (error) => {
            server.close(() => reject(error));
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, accounts, users RESTART IDENTITY CASCADE");
}

async function insertUser({
    username = "auth-user",
    email = "auth-user@example.com",
    firstName = "Auth",
    lastName = "User",
    role = "accountant",
    status = "active",
    password = "ValidPass1!",
    tempPassword = false,
    failedLoginAttempts = 0,
    suspensionStartAt = null,
    suspensionEndAt = null,
} = {}) {
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
            temp_password,
            failed_login_attempts,
            suspension_start_at,
            suspension_end_at,
            user_icon_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            $8, $9, $10, $11,
            gen_random_uuid()
        ) RETURNING id, username, role, status`,
        [username, email, firstName, lastName, role, status, password, tempPassword, failedLoginAttempts, suspensionStartAt, suspensionEndAt],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "auth-token", logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, now(), $3)", [userId, token, logoutAt]);
}

function authHeaders({ userId, token }) {
    return {
        Authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

test.beforeEach(async () => {
    await resetDb();
});

test("GET /api/auth/status returns logged-out state for missing or malformed auth", async () => {
    const app = createApp();

    const missingAuth = await request({ app, method: "GET", path: "/api/auth/status" });
    assert.equal(missingAuth.statusCode, 200);
    assert.deepEqual(missingAuth.body, { ok: false, loggedIn: false });

    const malformedAuth = await request({
        app,
        method: "GET",
        path: "/api/auth/status",
        headers: { Authorization: "Token nope" },
    });
    assert.equal(malformedAuth.statusCode, 200);
    assert.deepEqual(malformedAuth.body, { ok: false, loggedIn: false });

    const missingUserId = await request({
        app,
        method: "GET",
        path: "/api/auth/status",
        headers: { Authorization: "Bearer token-only" },
    });
    assert.equal(missingUserId.statusCode, 200);
    assert.deepEqual(missingUserId.body, { ok: false, loggedIn: false });
});

test("GET /api/auth/status returns logged-in admin flags for valid session", async () => {
    const admin = await insertUser({
        username: "status-admin",
        email: "status-admin@example.com",
        role: "administrator",
    });
    const token = "status-admin-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const response = await request({
        app: createApp(),
        method: "GET",
        path: "/api/auth/status",
        headers: authHeaders({ userId: admin.id, token }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.loggedIn, true);
    assert.equal(response.body.isAdmin, true);
    assert.equal(response.body.is_admin, true);
});

test("POST /api/auth/logout validates headers and closes the active session", async () => {
    const user = await insertUser({
        username: "logout-user",
        email: "logout-user@example.com",
    });
    const token = "logout-user-token";
    await insertLoggedInUser({ userId: user.id, token });

    const app = createApp();

    const missingAuth = await request({
        app,
        method: "POST",
        path: "/api/auth/logout",
    });
    assert.equal(missingAuth.statusCode, 401);
    assert.equal(missingAuth.body.errorCode, "ERR_MISSING_AUTH_HEADER");

    const invalidAuth = await request({
        app,
        method: "POST",
        path: "/api/auth/logout",
        headers: { Authorization: "Token invalid" },
    });
    assert.equal(invalidAuth.statusCode, 401);
    assert.equal(invalidAuth.body.errorCode, "ERR_INVALID_AUTH_HEADER");

    const missingUserId = await request({
        app,
        method: "POST",
        path: "/api/auth/logout",
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(missingUserId.statusCode, 401);
    assert.equal(missingUserId.body.errorCode, "ERR_MISSING_USER_ID_HEADER");

    const success = await request({
        app,
        method: "POST",
        path: "/api/auth/logout",
        headers: authHeaders({ userId: user.id, token }),
    });
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.messageCode, "MSG_LOGGED_OUT_SUCCESS");
    assert.equal(success.body.ok, true);

    const session = await db.query("SELECT logout_at FROM logged_in_users WHERE user_id = $1 AND token = $2", [user.id, token]);
    assert.equal(session.rowCount, 1);
    assert.ok(session.rows[0].logout_at);
});

test("POST /api/auth/login rejects unknown, inactive, and future-suspended users", async () => {
    const pendingUser = await insertUser({
        username: "pending-login",
        email: "pending-login@example.com",
        status: "pending",
    });
    const futureSuspended = await insertUser({
        username: "future-suspended",
        email: "future-suspended@example.com",
        status: "suspended",
        suspensionStartAt: new Date(Date.now() - 60 * 1000),
        suspensionEndAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const app = createApp();

    const missingUser = await request({
        app,
        method: "POST",
        path: "/api/auth/login",
        body: { username: "missing-user", password: "ValidPass1!" },
    });
    assert.equal(missingUser.statusCode, 401);
    assert.equal(missingUser.body.errorCode, "ERR_INVALID_USERNAME_OR_PASSWORD");

    const pending = await request({
        app,
        method: "POST",
        path: "/api/auth/login",
        body: { username: pendingUser.username, password: "ValidPass1!" },
    });
    assert.equal(pending.statusCode, 401);
    assert.equal(pending.body.errorCode, "ERR_INVALID_USERNAME_OR_PASSWORD");

    const suspended = await request({
        app,
        method: "POST",
        path: "/api/auth/login",
        body: { username: futureSuspended.username, password: "ValidPass1!" },
    });
    assert.equal(suspended.statusCode, 403);
    assert.equal(suspended.body.errorCode, "ERR_ACCOUNT_SUSPENDED_UNTIL");
});

test("POST /api/auth/login suspends the account on the third failed password attempt", async () => {
    const user = await insertUser({
        username: "lockout-user",
        email: "lockout-user@example.com",
        failedLoginAttempts: 2,
    });

    const response = await request({
        app: createApp(),
        method: "POST",
        path: "/api/auth/login",
        body: { username: user.username, password: "WrongPass9!" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.errorCode, "ERR_ACCOUNT_SUSPENDED_DUE_TO_ATTEMPTS");

    const state = await db.query(
        "SELECT status, failed_login_attempts, suspension_start_at, suspension_end_at FROM users WHERE id = $1",
        [user.id],
    );
    assert.equal(state.rows[0].status, "suspended");
    assert.equal(state.rows[0].failed_login_attempts, 0);
    assert.ok(state.rows[0].suspension_start_at);
    assert.ok(state.rows[0].suspension_end_at);
});

test("POST /api/auth/login unsuspends expired suspensions and authenticates the user", async () => {
    const user = await insertUser({
        username: "expired-suspension-user",
        email: "expired-suspension-user@example.com",
        status: "suspended",
        suspensionStartAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        suspensionEndAt: new Date(Date.now() - 60 * 1000),
    });

    const response = await request({
        app: createApp(),
        method: "POST",
        path: "/api/auth/login",
        body: { username: user.username, password: "ValidPass1!" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.username, user.username);
    assert.ok(response.body.token);

    const state = await db.query("SELECT status, failed_login_attempts, suspension_start_at, suspension_end_at FROM users WHERE id = $1", [user.id]);
    assert.equal(state.rows[0].status, "active");
    assert.equal(state.rows[0].failed_login_attempts, 0);
    assert.equal(state.rows[0].suspension_start_at, null);
    assert.equal(state.rows[0].suspension_end_at, null);
});

test("POST /api/auth/login creates a session and flags temporary-password users", async () => {
    const user = await insertUser({
        username: "temp-password-user",
        email: "temp-password-user@example.com",
        firstName: "Temp",
        lastName: "Password",
        tempPassword: true,
        failedLoginAttempts: 2,
    });

    const response = await request({
        app: createApp(),
        method: "POST",
        path: "/api/auth/login",
        body: { username: user.username, password: "ValidPass1!" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.user_id, user.id);
    assert.equal(response.body.username, user.username);
    assert.equal(response.body.must_change_password, true);
    assert.equal(response.body.fullName, "Temp Password");
    assert.ok(response.body.token);

    const session = await db.query("SELECT token FROM logged_in_users WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [user.id]);
    assert.equal(session.rowCount, 1);
    assert.equal(session.rows[0].token, response.body.token);

    const state = await db.query("SELECT failed_login_attempts, suspension_start_at, suspension_end_at, last_login_at FROM users WHERE id = $1", [user.id]);
    assert.equal(state.rows[0].failed_login_attempts, 0);
    assert.equal(state.rows[0].suspension_start_at, null);
    assert.equal(state.rows[0].suspension_end_at, null);
    assert.ok(state.rows[0].last_login_at);
});
