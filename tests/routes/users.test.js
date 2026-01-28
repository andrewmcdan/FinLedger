/**
 * @fileoverview Route-level integration tests for src/routes/users.js (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");

const emailCalls = [];
const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

// Stub email so route tests don't actually send anything.
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
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, accounts, users RESTART IDENTITY CASCADE");
}

async function insertUser({
    username = "user1",
    email = "user1@example.com",
    firstName = "Test",
    lastName = "User",
    role = "accountant",
    status = "active",
    password = "ValidPass1!",
    resetToken = null,
    resetTokenExpiresAt = null,
    tempPassword = false,
    security = null,
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
            reset_token,
            reset_token_expires_at,
            temp_password,
            security_question_1,
            security_answer_hash_1,
            security_question_2,
            security_answer_hash_2,
            security_question_3,
            security_answer_hash_3,
            user_icon_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            $8, $9,
            $10,
            $11, crypt($12, gen_salt('bf')),
            $13, crypt($14, gen_salt('bf')),
            $15, crypt($16, gen_salt('bf')),
            gen_random_uuid()
        ) RETURNING id`,
        [
            username,
            email,
            firstName,
            lastName,
            role,
            status,
            password,
            resetToken,
            resetTokenExpiresAt,
            tempPassword,
            security?.[0]?.question || null,
            security?.[0]?.answer || "a1",
            security?.[1]?.question || null,
            security?.[1]?.answer || "a2",
            security?.[2]?.question || null,
            security?.[2]?.answer || "a3",
        ],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
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
                    const parsed = data ? JSON.parse(data) : null;
                    resolve({ statusCode: res.statusCode, body: parsed, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function requestMultipart({ port, method, path: reqPath, headers = {}, fields = {} }) {
    const boundary = `----finledger-test-${Math.random().toString(16).slice(2)}`;
    const parts = Object.entries(fields).map(([key, value]) => {
        return [
            `--${boundary}`,
            `Content-Disposition: form-data; name="${key}"`,
            "",
            String(value),
        ].join("\r\n");
    });
    const body = `${parts.join("\r\n")}\r\n--${boundary}--\r\n`;
    const buf = Buffer.from(body, "utf8");

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method,
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                    "Content-Length": buf.length,
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
                    const parsed = data ? JSON.parse(data) : null;
                    resolve({ statusCode: res.statusCode, body: parsed, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        req.write(buf);
        req.end();
    });
}

function authHeaders({ userId, token }) {
    return {
        authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

test.beforeEach(async () => {
    await resetDb();
    emailCalls.length = 0;
});

test("GET /api/users/security-questions-list is public and returns available security questions", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({ port, method: "GET", path: "/api/users/security-questions-list" });
        assert.equal(res.statusCode, 200);
        assert.ok(res.body);
        assert.ok(res.body.security_questions);
    } finally {
        server.close();
    }
});

test("GET /api/users/get-user/:userId returns user details for admin", async () => {
    const admin = await insertUser({ username: "admin", email: "admin@example.com", role: "administrator" });
    const target = await insertUser({ username: "target", email: "target@example.com", role: "accountant" });
    const token = "admin-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "GET",
            path: `/api/users/get-user/${target.id}`,
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.user.id, target.id);
        assert.equal(res.body.user.email, "target@example.com");
    } finally {
        server.close();
    }
});

test("GET /api/users/get-user/:userId rejects non-admins", async () => {
    const user = await insertUser({ username: "u1", email: "u1@example.com", role: "accountant" });
    const token = "user-token";
    await insertLoggedInUser({ userId: user.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "GET",
            path: `/api/users/get-user/${user.id}`,
            headers: authHeaders({ userId: user.id, token }),
        });
        assert.equal(res.statusCode, 403);
        assert.match(res.body.error, /Administrator role required/);
    } finally {
        server.close();
    }
});

test("GET /api/users/list-users returns list for admin and rejects missing session", async () => {
    const admin = await insertUser({ username: "admin2", email: "admin2@example.com", role: "administrator" });
    await insertUser({ username: "u2", email: "u2@example.com" });
    const token = "admin2-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const ok = await requestJson({
            port,
            method: "GET",
            path: "/api/users/list-users",
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(ok.statusCode, 200);
        assert.ok(Array.isArray(ok.body.users));
        assert.ok(ok.body.users.length >= 2);

        const missingAuth = await requestJson({
            port,
            method: "GET",
            path: "/api/users/list-users",
        });
        assert.equal(missingAuth.statusCode, 401);
        assert.match(missingAuth.body.error, /Missing Authorization header/);
    } finally {
        server.close();
    }
});

test("POST /api/users/email-user sends email for admin and 400s on missing fields", async () => {
    const admin = await insertUser({ username: "admin3", email: "admin3@example.com", role: "administrator" });
    const recipient = await insertUser({ username: "bob", email: "bob@example.com", firstName: "Bob" });
    const token = "admin3-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const bad = await requestJson({
            port,
            method: "POST",
            path: "/api/users/email-user",
            headers: authHeaders({ userId: admin.id, token }),
            body: { username: "bob", subject: "Hi" },
        });
        assert.equal(bad.statusCode, 400);

        const ok = await requestJson({
            port,
            method: "POST",
            path: "/api/users/email-user",
            headers: authHeaders({ userId: admin.id, token }),
            body: { username: "bob", subject: "Test Subject", message: "Hello" },
        });
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body.message, "Email sent successfully");
        assert.equal(emailCalls.length, 1);
        assert.equal(emailCalls[0].to, recipient.email);
        assert.match(emailCalls[0].body, /Dear Bob/);
    } finally {
        server.close();
    }
});

test("GET /api/users/approve-user/:userId approves pending user (and emails)", async () => {
    const admin = await insertUser({ username: "admin4", email: "admin4@example.com", role: "administrator" });
    const pending = await insertUser({ username: "pend", email: "pend@example.com", status: "pending", firstName: "Pen" });
    const token = "admin4-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "GET",
            path: `/api/users/approve-user/${pending.id}`,
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.message, "User approved successfully");

        const status = await db.query("SELECT status FROM users WHERE id = $1", [pending.id]);
        assert.equal(status.rows[0].status, "active");
        assert.ok(emailCalls.length >= 1);
    } finally {
        server.close();
    }
});

test("GET /api/users/approve-user/:userId rejects non-pending users", async () => {
    const admin = await insertUser({ username: "admin5", email: "admin5@example.com", role: "administrator" });
    const active = await insertUser({ username: "act", email: "act@example.com", status: "active" });
    const token = "admin5-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "GET",
            path: `/api/users/approve-user/${active.id}`,
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /not pending approval/);
    } finally {
        server.close();
    }
});

test("POST /api/users/change-password updates password with current password (multipart)", async () => {
    const user = await insertUser({ username: "cpw", email: "cpw@example.com", password: "ValidPass1!" });
    const token = "cpw-token";
    await insertLoggedInUser({ userId: user.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const ok = await requestMultipart({
            port,
            method: "POST",
            path: "/api/users/change-password",
            headers: authHeaders({ userId: user.id, token }),
            fields: { current_password: "ValidPass1!", new_password: "NewPass2@", confirm_new_password: "NewPass2@" },
        });
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body.message, "Password changed successfully");

        const bad = await requestMultipart({
            port,
            method: "POST",
            path: "/api/users/change-password",
            headers: authHeaders({ userId: user.id, token }),
            fields: { current_password: "wrong", new_password: "NewPass3#" },
        });
        assert.equal(bad.statusCode, 403);
        assert.match(bad.body.error, /Current password is incorrect/);
    } finally {
        server.close();
    }
});

test("POST /api/users/update-security-questions rejects invalid current password", async () => {
    const user = await insertUser({ username: "useq", email: "useq@example.com", password: "ValidPass1!" });
    const token = "useq-token";
    await insertLoggedInUser({ userId: user.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "POST",
            path: "/api/users/update-security-questions",
            headers: authHeaders({ userId: user.id, token }),
            body: {
                current_password: "wrong",
                security_question_1: "Q1?",
                security_answer_1: "A1",
                security_question_2: "Q2?",
                security_answer_2: "A2",
                security_question_3: "Q3?",
                security_answer_3: "A3",
            },
        });
        assert.equal(res.statusCode, 403);
        assert.match(res.body.error, /Current password is incorrect/);
    } finally {
        server.close();
    }
});

test("POST /api/users/register_new_user is public and creates pending user", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();
        const res = await requestJson({
            port,
            method: "POST",
            path: "/api/users/register_new_user",
            body: {
                first_name: "New",
                last_name: "User",
                email: "newuser@example.com",
                password: "ValidPass1!",
                address: "1 Main",
                date_of_birth: "1990-01-01",
                role: "accountant",
                security_question_1: "Q1?",
                security_answer_1: "A1",
                security_question_2: "Q2?",
                security_answer_2: "A2",
                security_question_3: "Q3?",
                security_answer_3: "A3",
            },
        });
        assert.equal(res.statusCode, 200);
        assert.ok(res.body.user?.id);

        const check = await db.query("SELECT status, email FROM users WHERE id = $1", [res.body.user.id]);
        assert.equal(check.rows[0].status, "pending");
        assert.equal(check.rows[0].email, "newuser@example.com");
        assert.equal(emailCalls.length, 1);
    } finally {
        server.close();
    }
});

test("Password reset flow: GET /reset-password issues token, then /security-questions and /verify-security-answers", async () => {
    const token = "token-reset";
    const user = await insertUser({
        username: "resetuser",
        email: "resetuser@example.com",
        password: "ValidPass1!",
        security: [
            { question: "Q1?", answer: "A1" },
            { question: "Q2?", answer: "A2" },
            { question: "Q3?", answer: "A3" },
        ],
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const issue = await requestJson({
            port,
            method: "GET",
            path: `/api/users/reset-password/${encodeURIComponent(user.email)}/${encodeURIComponent(user.username)}`,
        });
        assert.equal(issue.statusCode, 200);

        const dbUser = await db.query("SELECT reset_token FROM users WHERE id = $1", [user.id]);
        assert.ok(dbUser.rows[0].reset_token);

        const qs = await requestJson({
            port,
            method: "GET",
            path: `/api/users/security-questions/${dbUser.rows[0].reset_token}`,
        });
        assert.equal(qs.statusCode, 200);
        assert.ok(qs.body.security_questions);

        const bad = await requestJson({
            port,
            method: "POST",
            path: `/api/users/verify-security-answers/${dbUser.rows[0].reset_token}`,
            body: { securityAnswers: ["bad", "A2", "A3"], newPassword: "NewPass9!" },
        });
        assert.equal(bad.statusCode, 403);

        const ok = await requestJson({
            port,
            method: "POST",
            path: `/api/users/verify-security-answers/${dbUser.rows[0].reset_token}`,
            body: { securityAnswers: ["A1", "A2", "A3"], newPassword: "NewPass9!" },
        });
        assert.equal(ok.statusCode, 200);
        assert.match(ok.body.message, /Password reset successfully/);
    } finally {
        server.close();
    }

    // Keep linter happy about unused local in case of future edits.
    assert.equal(typeof token, "string");
});

test("Admin user management endpoints: suspend, reinstate, update-user-field, delete-user, reset-user-password", async () => {
    const admin = await insertUser({ username: "admin6", email: "admin6@example.com", role: "administrator" });
    const user = await insertUser({ username: "victim", email: "victim@example.com", role: "accountant", status: "active" });
    const token = "admin6-token";
    await insertLoggedInUser({ userId: admin.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
        const { port } = server.address();

        const suspend = await requestJson({
            port,
            method: "POST",
            path: "/api/users/suspend-user",
            headers: authHeaders({ userId: admin.id, token }),
            body: { userIdToSuspend: user.id, suspensionStart: new Date().toISOString(), suspensionEnd: new Date(Date.now() + 3600_000).toISOString() },
        });
        assert.equal(suspend.statusCode, 200);

        const reinstate = await requestJson({
            port,
            method: "GET",
            path: `/api/users/reinstate-user/${user.id}`,
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(reinstate.statusCode, 200);

        const update = await requestJson({
            port,
            method: "POST",
            path: "/api/users/update-user-field",
            headers: authHeaders({ userId: admin.id, token }),
            body: { user_id: user.id, field: "email", value: "victim2@example.com" },
        });
        assert.equal(update.statusCode, 200);

        const resetPw = await requestJson({
            port,
            method: "GET",
            path: `/api/users/reset-user-password/${user.id}`,
            headers: authHeaders({ userId: admin.id, token }),
        });
        assert.equal(resetPw.statusCode, 200);
        assert.ok(emailCalls.length >= 1);

        const del = await requestJson({
            port,
            method: "POST",
            path: "/api/users/delete-user",
            headers: authHeaders({ userId: admin.id, token }),
            body: { userIdToDelete: user.id },
        });
        assert.equal(del.statusCode, 200);

        const gone = await db.query("SELECT 1 FROM users WHERE id = $1", [user.id]);
        assert.equal(gone.rowCount, 0);
    } finally {
        server.close();
    }
});
