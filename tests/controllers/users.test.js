/**
 * @fileoverview Integration tests for users controller functions (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const db = require("../../src/db/db");

const emailCalls = [];
const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");
const usersModulePath = path.resolve(__dirname, "../../src/controllers/users.js");

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

delete require.cache[usersModulePath];
const usersController = require(usersModulePath);

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, users RESTART IDENTITY CASCADE");
}

async function insertUser({ username, email, firstName = "Test", lastName = "User", role = "accountant", status = "active", password = "ValidPass1!", passwordExpiresAt = null, suspensionStartAt = null, suspensionEndAt = null, resetToken = null, resetTokenExpiresAt = null, tempPassword = false } = {}) {
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
            suspension_start_at,
            suspension_end_at,
            reset_token,
            reset_token_expires_at,
            temp_password
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            $8, $9, $10, $11, $12, $13
        ) RETURNING id, password_hash`,
        [username, email, firstName, lastName, role, status, password, passwordExpiresAt, suspensionStartAt, suspensionEndAt, resetToken, resetTokenExpiresAt, tempPassword],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
}

test.beforeEach(async () => {
    await resetDb();
    emailCalls.length = 0;
});

test("getUserLoggedInStatus returns false when not logged in", async () => {
    const user = await insertUser({ username: "nologin", email: "nologin@example.com" });
    const loggedIn = await usersController.getUserLoggedInStatus(user.id, "missing-token");
    assert.equal(loggedIn, false);
});

test("getUserLoggedInStatus returns true and extends session", async () => {
    const user = await insertUser({ username: "session", email: "session@example.com" });
    const token = "token-session";
    const initialLogout = new Date(Date.now() + 30 * 60 * 1000);
    await insertLoggedInUser({ userId: user.id, token, logoutAt: initialLogout });

    const loggedIn = await usersController.getUserLoggedInStatus(user.id, token);
    assert.equal(loggedIn, true);

    const result = await db.query("SELECT logout_at FROM logged_in_users WHERE user_id = $1 AND token = $2", [user.id, token]);
    assert.ok(result.rows[0].logout_at > initialLogout);
});

test("getUserLoggedInStatus returns false for expired session", async () => {
    const user = await insertUser({ username: "expiredsess", email: "expiredsess@example.com" });
    const token = "expired-token";
    await insertLoggedInUser({
        userId: user.id,
        token,
        logoutAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const loggedIn = await usersController.getUserLoggedInStatus(user.id, token);
    assert.equal(loggedIn, false);
});

test("isAdmin returns true only for admin with valid session", async () => {
    const admin = await insertUser({ username: "admin", email: "admin@example.com", role: "administrator" });
    const token = "admin-token";
    await insertLoggedInUser({ userId: admin.id, token });
    const isAdmin = await usersController.isAdmin(admin.id, token);
    assert.equal(isAdmin, true);

    const user = await insertUser({ username: "user", email: "user@example.com", role: "accountant" });
    const userToken = "user-token";
    await insertLoggedInUser({ userId: user.id, token: userToken });
    const isUserAdmin = await usersController.isAdmin(user.id, userToken);
    assert.equal(isUserAdmin, false);
});

test("isAdmin returns false when token missing or session invalid", async () => {
    const admin = await insertUser({ username: "admin2", email: "admin2@example.com", role: "administrator" });
    const missingToken = await usersController.isAdmin(admin.id, null);
    assert.equal(missingToken, false);

    const invalidToken = await usersController.isAdmin(admin.id, "not-logged-in");
    assert.equal(invalidToken, false);
});

test("getUserById returns user and null for missing", async () => {
    const user = await insertUser({ username: "byid", email: "byid@example.com" });
    const found = await usersController.getUserById(user.id);
    assert.equal(found.email, "byid@example.com");
    const missing = await usersController.getUserById(9999);
    assert.equal(missing, null);
});

test("getUserByEmail returns user and null for missing", async () => {
    await insertUser({ username: "byemail", email: "byemail@example.com" });
    const found = await usersController.getUserByEmail("byemail@example.com");
    assert.equal(found.username, "byemail");
    const missing = await usersController.getUserByEmail("missing@example.com");
    assert.equal(missing, null);
});

test("getUserByResetToken returns user only when token valid", async () => {
    const token = "reset-token";
    const user = await insertUser({
        username: "reset",
        email: "reset@example.com",
        resetToken: token,
        resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const found = await usersController.getUserByResetToken(token);
    assert.equal(found.id, user.id);
    const missing = await usersController.getUserByResetToken("bad-token");
    assert.equal(missing, null);
});

test("getUserByResetToken returns null for expired token", async () => {
    const token = "expired-reset";
    await insertUser({
        username: "reset-expired",
        email: "reset-expired@example.com",
        resetToken: token,
        resetTokenExpiresAt: new Date(Date.now() - 60 * 1000),
    });
    const missing = await usersController.getUserByResetToken(token);
    assert.equal(missing, null);
});

test("listUsers returns users ordered by id", async () => {
    await insertUser({ username: "list1", email: "list1@example.com" });
    await insertUser({ username: "list2", email: "list2@example.com" });
    const users = await usersController.listUsers();
    assert.equal(users.length, 2);
    assert.ok(users[0].id < users[1].id);
});

test("listLoggedInUsers returns unique active users with latest login", async () => {
    const user = await insertUser({ username: "log1", email: "log1@example.com" });
    await insertLoggedInUser({
        userId: user.id,
        token: "old",
        loginAt: new Date(Date.now() - 60 * 60 * 1000),
        logoutAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await insertLoggedInUser({
        userId: user.id,
        token: "new",
        loginAt: new Date(),
        logoutAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await insertLoggedInUser({
        userId: user.id,
        token: "expired",
        loginAt: new Date(),
        logoutAt: new Date(Date.now() - 60 * 1000),
    });

    const loggedIn = await usersController.listLoggedInUsers();
    assert.equal(loggedIn.length, 1);
    assert.equal(loggedIn[0].user_id, user.id);
    assert.ok(loggedIn[0].login_at >= new Date(Date.now() - 5 * 60 * 1000));
});

test("listLoggedInUsers returns one row per user", async () => {
    const userA = await insertUser({ username: "loga", email: "loga@example.com" });
    const userB = await insertUser({ username: "logb", email: "logb@example.com" });
    await insertLoggedInUser({ userId: userA.id, token: "a1", loginAt: new Date(Date.now() - 10 * 60 * 1000) });
    await insertLoggedInUser({ userId: userA.id, token: "a2", loginAt: new Date(Date.now() - 5 * 60 * 1000) });
    await insertLoggedInUser({ userId: userB.id, token: "b1", loginAt: new Date(Date.now() - 2 * 60 * 1000) });

    const loggedIn = await usersController.listLoggedInUsers();
    assert.equal(loggedIn.length, 2);
    const ids = loggedIn.map((row) => row.user_id).sort();
    assert.deepEqual(ids, [userA.id, userB.id].sort());
});

test("approveUser updates status to active", async () => {
    const user = await insertUser({ username: "approve", email: "approve@example.com", status: "pending" });
    await usersController.approveUser(user.id);
    const result = await db.query("SELECT status FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "active");
});

test("rejectUser updates status to rejected", async () => {
    const user = await insertUser({ username: "reject", email: "reject@example.com", status: "pending" });
    await usersController.rejectUser(user.id);
    const result = await db.query("SELECT status FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "rejected");
});

test("suspendUser and reinstateUser update suspension fields", async () => {
    const user = await insertUser({ username: "suspend", email: "suspend@example.com", status: "active" });
    const start = new Date();
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await usersController.suspendUser(user.id, start, end);
    let result = await db.query("SELECT status, suspension_start_at, suspension_end_at FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "suspended");
    assert.ok(result.rows[0].suspension_start_at);
    assert.ok(result.rows[0].suspension_end_at);

    await usersController.reinstateUser(user.id);
    result = await db.query("SELECT status, suspension_start_at, suspension_end_at FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "active");
    assert.equal(result.rows[0].suspension_start_at, null);
    assert.equal(result.rows[0].suspension_end_at, null);
});

test("changePassword enforces complexity and history", async () => {
    const user = await insertUser({ username: "changepw", email: "changepw@example.com", password: "ValidPass1!" });
    await assert.rejects(() => usersController.changePassword(user.id, "short"), /complexity requirements/);

    await db.query("INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)", [user.id, user.password_hash]);
    await assert.rejects(() => usersController.changePassword(user.id, "ValidPass1!"), /past passwords/);

    await usersController.changePassword(user.id, "NewPass2@");
    const history = await db.query("SELECT * FROM password_history WHERE user_id = $1", [user.id]);
    assert.ok(history.rowCount >= 1);
});

test("changePassword clears temp_password flag", async () => {
    const user = await insertUser({
        username: "tempflag",
        email: "tempflag@example.com",
        password: "ValidPass1!",
        tempPassword: true,
    });
    await usersController.changePassword(user.id, "NewPass3#");
    const result = await db.query("SELECT temp_password FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].temp_password, false);
});

test("createUser creates user and sends temp password email when needed", async () => {
    const created = await usersController.createUser("Alice", "Smith", "alice@example.com", "ValidPass1!", "accountant", "123 Main", new Date("1990-01-01"), null);
    assert.ok(created.id);
    assert.equal(created.username.startsWith("ASmith"), true);
    assert.equal(emailCalls.length, 0);

    const tempCreated = await usersController.createUser("Bob", "Jones", "bob@example.com", "", "manager", "456 Main", new Date("1985-02-02"), null);
    const tempResult = await db.query("SELECT temp_password FROM users WHERE id = $1", [tempCreated.id]);
    assert.equal(tempResult.rows[0].temp_password, true);
    assert.equal(emailCalls.length, 1);
});

test("createUser appends serial suffix for duplicate generated usernames", async () => {
    const first = await usersController.createUser("John", "Doe", "john@example.com", "ValidPass1!", "accountant", "123 Main", new Date("1990-01-01"), null);
    const second = await usersController.createUser("Jane", "Doe", "jane@example.com", "ValidPass1!", "accountant", "124 Main", new Date("1991-01-01"), null);
    const third = await usersController.createUser("Jill", "Doe", "jill@example.com", "ValidPass1!", "accountant", "125 Main", new Date("1992-01-01"), null);

    assert.equal(second.username, `${first.username}-01`);
    assert.equal(third.username, `${first.username}-02`);
});

test("createUser rejects invalid role and missing required fields", async () => {
    await assert.rejects(() => usersController.createUser("Role", "Bad", "badrole@example.com", "ValidPass1!", "invalid", "1 Main", new Date("1990-01-01"), null), /Invalid role/);

    await assert.rejects(() => usersController.createUser("", "Pass", "missing@example.com", "ValidPass1!", "accountant", "1 Main", new Date("1990-01-01"), null), /cannot be empty/);
});

test("updateSecurityQuestions + verifySecurityAnswers", async () => {
    const user = await insertUser({ username: "secq", email: "secq@example.com" });
    const qa = [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
        { question: "Q3?", answer: "A3" },
    ];
    await usersController.updateSecurityQuestions(user.id, qa);
    const questions = await usersController.getSecurityQuestionsForUser(user.id);
    assert.equal(questions.security_question_1, "Q1?");
    const ok = await usersController.verifySecurityAnswers(user.id, ["A1", "A2", "A3"]);
    const bad = await usersController.verifySecurityAnswers(user.id, ["bad", "A2", "A3"]);
    assert.equal(ok, true);
    assert.equal(bad, false);
});

test("updateSecurityQuestions rejects non-3 question sets", async () => {
    const user = await insertUser({ username: "badsecq", email: "badsecq@example.com" });
    await assert.rejects(() => usersController.updateSecurityQuestions(user.id, [{ question: "Q1?", answer: "A1" }]), /Exactly three security questions/);
});

test("verifySecurityAnswers rejects non-3 answers", async () => {
    const user = await insertUser({ username: "badseca", email: "badseca@example.com" });
    await assert.rejects(() => usersController.verifySecurityAnswers(user.id, ["A1", "A2"]), /Exactly three answers/);
});

test("logoutInactiveUsers removes expired sessions", async () => {
    const user = await insertUser({ username: "logout", email: "logout@example.com" });
    await insertLoggedInUser({ userId: user.id, token: "expired", logoutAt: new Date(Date.now() - 60 * 1000) });
    await insertLoggedInUser({ userId: user.id, token: "active", logoutAt: new Date(Date.now() + 60 * 60 * 1000) });

    await usersController.logoutInactiveUsers();
    const result = await db.query("SELECT token FROM logged_in_users WHERE user_id = $1", [user.id]);
    assert.deepEqual(
        result.rows.map((r) => r.token),
        ["active"],
    );
});

test("unsuspendExpiredSuspensions restores active status", async () => {
    const user = await insertUser({
        username: "unsuspend",
        email: "unsuspend@example.com",
        status: "suspended",
        suspensionStartAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        suspensionEndAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await usersController.unsuspendExpiredSuspensions();
    const result = await db.query("SELECT status, suspension_start_at, suspension_end_at FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "active");
    assert.equal(result.rows[0].suspension_start_at, null);
    assert.equal(result.rows[0].suspension_end_at, null);
});

test("sendPasswordExpiryWarnings sends once per day and tracks", async () => {
    const user = await insertUser({
        username: "warn",
        email: "warn@example.com",
        passwordExpiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    await usersController.sendPasswordExpiryWarnings();
    assert.equal(emailCalls.length, 1);
    let tracking = await db.query("SELECT * FROM password_expiry_email_tracking WHERE user_id = $1", [user.id]);
    assert.equal(tracking.rowCount, 1);

    await usersController.sendPasswordExpiryWarnings();
    assert.equal(emailCalls.length, 1);
    tracking = await db.query("SELECT * FROM password_expiry_email_tracking WHERE user_id = $1", [user.id]);
    assert.equal(tracking.rowCount, 1);
});

test("sendPasswordExpiryWarnings skips users outside warning window", async () => {
    await insertUser({
        username: "far",
        email: "far@example.com",
        passwordExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });
    await usersController.sendPasswordExpiryWarnings();
    assert.equal(emailCalls.length, 0);
});

test("suspendUsersWithExpiredPasswords suspends and logs email", async () => {
    const user = await insertUser({
        username: "expired",
        email: "expired@example.com",
        status: "active",
        passwordExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await usersController.suspendUsersWithExpiredPasswords();
    const result = await db.query("SELECT status FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "suspended");
    const tracking = await db.query("SELECT * FROM password_expiry_email_tracking WHERE user_id = $1", [user.id]);
    assert.equal(tracking.rowCount, 1);
    assert.equal(emailCalls.length, 1);
});

test("suspendUsersWithExpiredPasswords ignores non-expired users", async () => {
    const user = await insertUser({
        username: "notexpired",
        email: "notexpired@example.com",
        status: "active",
        passwordExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await usersController.suspendUsersWithExpiredPasswords();
    const result = await db.query("SELECT status FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].status, "active");
    assert.equal(emailCalls.length, 0);
});

test("changePasswordWithCurrentPassword updates password when current password matches", async () => {
    const user = await insertUser({ username: "cpwcc", email: "cpwcc@example.com", password: "ValidPass1!" });

    await usersController.changePasswordWithCurrentPassword(user.id, "ValidPass1!", "NewPass2@");

    const ok = await db.query("SELECT 1 FROM users WHERE id = $1 AND password_hash = crypt($2, password_hash)", [user.id, "NewPass2@"]);
    assert.equal(ok.rowCount, 1);
});

test("changePasswordWithCurrentPassword rejects invalid current password", async () => {
    const user = await insertUser({ username: "cpwccbad", email: "cpwccbad@example.com", password: "ValidPass1!" });

    await assert.rejects(
        async () => usersController.changePasswordWithCurrentPassword(user.id, "wrong", "NewPass2@"),
        (err) => {
            assert.equal(err.code, "INVALID_CURRENT_PASSWORD");
            assert.match(err.message, /Current password is incorrect/);
            return true;
        },
    );
});

test("updateSecurityQuestionsWithCurrentPassword updates questions when current password matches", async () => {
    const user = await insertUser({ username: "useqcc", email: "useqcc@example.com", password: "ValidPass1!" });
    const qa = [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
        { question: "Q3?", answer: "A3" },
    ];

    await usersController.updateSecurityQuestionsWithCurrentPassword(user.id, "ValidPass1!", qa);

    const questions = await usersController.getSecurityQuestionsForUser(user.id);
    assert.equal(questions.security_question_1, "Q1?");
    const verified = await usersController.verifySecurityAnswers(user.id, ["A1", "A2", "A3"]);
    assert.equal(verified, true);
});

test("updateSecurityQuestionsWithCurrentPassword rejects invalid current password", async () => {
    const user = await insertUser({ username: "useqccbad", email: "useqccbad@example.com", password: "ValidPass1!" });
    const qa = [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
        { question: "Q3?", answer: "A3" },
    ];

    await assert.rejects(
        async () => usersController.updateSecurityQuestionsWithCurrentPassword(user.id, "wrong", qa),
        (err) => {
            assert.equal(err.code, "INVALID_CURRENT_PASSWORD");
            assert.match(err.message, /Current password is incorrect/);
            return true;
        },
    );
});

test("updateUserProfile updates provided fields and returns updated user", async () => {
    const user = await insertUser({ username: "uprof", email: "uprof@example.com", firstName: "Old", lastName: "Name", password: "ValidPass1!" });

    const updated = await usersController.updateUserProfile(user.id, { first_name: "New", last_name: "Name2", address: "123 Main" });
    assert.ok(updated);
    assert.equal(updated.first_name, "New");
    assert.equal(updated.last_name, "Name2");
    assert.equal(updated.address, "123 Main");

    const dbUser = await db.query("SELECT first_name, last_name, address FROM users WHERE id = $1", [user.id]);
    assert.equal(dbUser.rows[0].first_name, "New");
    assert.equal(dbUser.rows[0].last_name, "Name2");
    assert.equal(dbUser.rows[0].address, "123 Main");
});

test("updateUserProfile returns null when no updates provided", async () => {
    const user = await insertUser({ username: "uprofnone", email: "uprofnone@example.com" });
    const updated = await usersController.updateUserProfile(user.id, {});
    assert.equal(updated, null);
});

test("updateUserProfile returns null when user missing", async () => {
    const updated = await usersController.updateUserProfile(999999, { first_name: "X" });
    assert.equal(updated, null);
});

test("deleteUserById removes user record", async () => {
    const user = await insertUser({ username: "del", email: "del@example.com" });
    await usersController.deleteUserById(user.id);
    const result = await db.query("SELECT 1 FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rowCount, 0);
});

test("setUserPassword updates password hash and temp flag", async () => {
    const user = await insertUser({ username: "setpw", email: "setpw@example.com", password: "ValidPass1!" });

    const ok = await usersController.setUserPassword(user.id, "NewPass2@", true);
    assert.equal(ok, true);

    const result = await db.query("SELECT temp_password FROM users WHERE id = $1", [user.id]);
    assert.equal(result.rows[0].temp_password, true);

    const match = await db.query("SELECT 1 FROM users WHERE id = $1 AND password_hash = crypt($2, password_hash)", [user.id, "NewPass2@"]);
    assert.equal(match.rowCount, 1);
});

test("setUserPassword rejects passwords that fail complexity checks", async () => {
    const user = await insertUser({ username: "setpwb", email: "setpwb@example.com", password: "ValidPass1!" });
    await assert.rejects(() => usersController.setUserPassword(user.id, "short", false), /complexity requirements/);
});

test("getUserByUsername returns user and null for missing", async () => {
    const user = await insertUser({ username: "byuname", email: "byuname@example.com" });
    const found = await usersController.getUserByUsername("byuname");
    assert.equal(found.id, user.id);
    const missing = await usersController.getUserByUsername("nope");
    assert.equal(missing, null);
});
