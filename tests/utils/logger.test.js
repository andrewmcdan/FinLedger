/**
 * @fileoverview Integration tests for logger behavior against app_logs.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../src/db/db");
const logger = require("../../src/utils/logger");

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, account_subcategories, account_categories, accounts, users RESTART IDENTITY CASCADE");
}

async function insertUser({
    username = "logger-user",
    email = "logger-user@example.com",
    firstName = "Logger",
    lastName = "User",
    role = "accountant",
    status = "active",
    password = "ValidPass1!",
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
            temp_password
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false
        ) RETURNING id`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

test.beforeEach(async () => {
    await resetDb();
});

test("logger writes app_logs with user_id when user exists", async () => {
    const user = await insertUser();
    const message = `logger-existing-user-${Date.now()}`;

    await logger.log("warn", message, { test: "existing-user" }, "", user.id, { skipConsole: true, skipFile: true });

    const result = await db.query("SELECT user_id, level, message FROM app_logs WHERE message = $1 ORDER BY id DESC LIMIT 1", [message]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].level, "warn");
    assert.equal(result.rows[0].message, message);
    assert.equal(result.rows[0].user_id, String(user.id));
});

test("logger does not violate FK when user_id does not exist", async () => {
    const missingUserId = 999999;
    const message = `logger-missing-user-${Date.now()}`;

    await logger.log("warn", message, { test: "missing-user" }, "", missingUserId, { skipConsole: true, skipFile: true });

    const result = await db.query("SELECT user_id, level, message FROM app_logs WHERE message = $1 ORDER BY id DESC LIMIT 1", [message]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].level, "warn");
    assert.equal(result.rows[0].message, message);
    assert.equal(result.rows[0].user_id, null);
});
