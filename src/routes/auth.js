const express = require("express");
const { getUserLoggedInStatus, isAdmin } = require("../controllers/users.js");
const router = express.Router();
const db = require("../db/db.js");
const jwt = require("jsonwebtoken");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");

router.use(express.json());

// Endpoint to check if user is logged in
router.get("/status", async (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        log("trace", "Auth status request missing authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.json({ ok: false, loggedIn: false });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        log("trace", "Auth status request invalid authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.json({ ok: false, loggedIn: false });
    }
    const user_id = req.get("X-User-Id");
    if (!user_id) {
        log("trace", "Auth status request missing user id header", { path: req.path }, utilities.getCallerInfo());
        return res.json({ ok: false, loggedIn: false });
    }
    req.user = { token: token, id: user_id };
    const loggedIn = await getUserLoggedInStatus(user_id, token);
    const isAdminStatus = await isAdmin(user_id, token);
    log("trace", "Auth status request processed", { user_id, loggedIn, isAdmin: isAdminStatus }, utilities.getCallerInfo(), user_id);
    res.json({ ok: true, loggedIn: loggedIn, isAdmin: isAdminStatus, is_admin: isAdminStatus });
});

router.post("/login", async (req, res) => {
    log("info", `Login attempt for username: ${req.body.username}`, { function: "login" }, utilities.getCallerInfo());
    // Implement login logic here
    const { username, password } = req.body;
    const userRowsNonAuth = await db.query("SELECT id, status, failed_login_attempts, suspension_start_at, suspension_end_at FROM users WHERE username = $1", [username]);
    if (userRowsNonAuth.rowCount === 0) {
        log("warn", `Login failed - user not found or inactive for username: ${username}`, { function: "login" }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_INVALID_USERNAME_OR_PASSWORD");
    }
    
    // First we get the user with no authentication to check for failed login attempts.
    const userNonAuth = userRowsNonAuth.rows[0];
    const now = new Date();
    await db.query("UPDATE users SET last_login_attempt_at = now(), updated_at = now() WHERE id = $1", [userNonAuth.id]);

    if (userNonAuth.status === "suspended") {
        if (!userNonAuth.suspension_end_at) {
            log("warn", `Blocked login attempt for suspended user. User id: ${userNonAuth.id}`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
            return sendApiError(res, 403, "ERR_ACCOUNT_SUSPENDED_DUE_TO_ATTEMPTS");
        }
        if (now < userNonAuth.suspension_end_at) {
            log("warn", `Blocked login attempt for suspended user. User id: ${userNonAuth.id}`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
            return sendApiError(res, 403, "ERR_ACCOUNT_SUSPENDED_UNTIL", { suspension_end_at: userNonAuth.suspension_end_at });
        }
        await db.query("UPDATE users SET status = 'active', failed_login_attempts = 0, suspension_start_at = NULL, suspension_end_at = NULL, updated_at = now() WHERE id = $1", [userNonAuth.id]);
        userNonAuth.status = "active";
        userNonAuth.failed_login_attempts = 0;
        userNonAuth.suspension_start_at = null;
        userNonAuth.suspension_end_at = null;
    }

    if (userNonAuth.status !== "active") {
        log("warn", `Login failed - user is not active for username: ${username}`, { function: "login", status: userNonAuth.status }, utilities.getCallerInfo(), userNonAuth.id);
        return sendApiError(res, 401, "ERR_INVALID_USERNAME_OR_PASSWORD");
    }

    // If the user has 3 or more failed login attempts, block login.
    if (userNonAuth.failed_login_attempts >= 3) {
        const suspensionEndAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years from now
        await db.query(
            "UPDATE users SET failed_login_attempts = 0, status = 'suspended', suspension_start_at = now(), suspension_end_at = $1, updated_at = now() WHERE id = $2",
            [suspensionEndAt, userNonAuth.id],
        );
        log("warn", `Blocked login attempt for suspended user who has too many attempts with incorrect passwords. User id: ${userNonAuth.id}`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
        return sendApiError(res, 403, "ERR_ACCOUNT_SUSPENDED_DUE_TO_ATTEMPTS");
    }

    // Now we check the password
    const userRows = await db.query("SELECT id, profile_image_url, suspension_end_at, status, temp_password, first_name, last_name FROM users WHERE password_hash = crypt($1, password_hash) AND username = $2 AND status = 'active'", [password, username]);
    // If the password was correct, we'll have one row in userRows
    const user = userRows.rows[0];

    // if userNonAuth has a row but userRows does not, it means password is incorrect
    if (userRows.rowCount === 0) {
        // increment failed login attempts
        const failedAttempts = userNonAuth.failed_login_attempts + 1;
        if (failedAttempts >= 3) {
            // Suspend account indefinitely (effectively) - admin must unsuspend.
            const suspensionEndAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years from now
            await db.query(
                "UPDATE users SET failed_login_attempts = 0, status = 'suspended', suspension_start_at = now(), suspension_end_at = $1, updated_at = now() WHERE id = $2",
                [suspensionEndAt, userNonAuth.id],
            );
            log("warn", `User suspended after max failed login attempts. User id: ${userNonAuth.id}`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
            return sendApiError(res, 403, "ERR_ACCOUNT_SUSPENDED_DUE_TO_ATTEMPTS");
        }
        await db.query("UPDATE users SET failed_login_attempts = $1, updated_at = now() WHERE id = $2", [failedAttempts, userNonAuth.id]);
    }

    // If no user found with that username/password
    if (userRows.rowCount === 0) {
        log("warn", `Failed login attempt for username: ${username}. Invalid username or password.`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
        return sendApiError(res, 401, "ERR_INVALID_USERNAME_OR_PASSWORD");
    }

    // If the user is found, not suspended, and password is correct, create a JWT token and save it in the DB.
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    try {
        await db.transaction(async (client) => {
            // Update last login time and log the login event
            await client.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
            await client.query("INSERT INTO logged_in_users (user_id, token) VALUES ($1, $2)", [user.id, token]);
            // reset failed login attempts on successful login
            await client.query("UPDATE users SET failed_login_attempts = 0, suspension_start_at = NULL, suspension_end_at = NULL WHERE id = $1", [user.id]);
        }, user.id);
    } catch (error) {
        log("error", `Login transaction failed for username ${username}: ${error}`, { function: "login" }, utilities.getCallerInfo(), user.id);
        return sendApiError(res, 500, "ERR_LOGIN_SERVER");
    }
    log("info", `User ${username} (ID: ${user.id}) logged in successfully`, { function: "login" }, utilities.getCallerInfo(), user.id);
    return res.json({ token: token, user_id: user.id, username: username, must_change_password: user.temp_password === true, fullName: `${user.first_name} ${user.last_name}` });
});

router.post("/logout", (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        log("warn", "Logout request missing Authorization header", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_MISSING_AUTH_HEADER");
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        log("warn", "Logout request invalid Authorization header", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_INVALID_AUTH_HEADER");
    }
    const user_id = req.get("X-User-Id");
    if (!user_id) {
        log("warn", "Logout request missing X-User-Id header", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_MISSING_USER_ID_HEADER");
    }
    log("info", `Logout request received for user ID ${user_id}`, { function: "logout" }, utilities.getCallerInfo(), user_id);
    // Set the logout_at column for user to now()
    db.query("UPDATE logged_in_users SET logout_at = NOW() WHERE user_id = $1 AND token = $2", [user_id, token], user_id)
        .then(() => {
            log("info", `User ID ${user_id} logged out successfully`, { function: "logout" }, utilities.getCallerInfo(), user_id);
            return sendApiSuccess(res, "MSG_LOGGED_OUT_SUCCESS", { ok: true });
        })
        .catch((error) => {
            log("error", `Error during logout for user ID ${user_id}: ${error}`, { function: "logout" }, utilities.getCallerInfo(), user_id);
            console.error("Error during logout:", error);
            return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
        });
});

module.exports = router;
