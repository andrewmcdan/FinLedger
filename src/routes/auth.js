const express = require("express");
const { getUserLoggedInStatus, isAdmin } = require("../controllers/users.js");
const router = express.Router();
const db = require("../db/db.js");
const jwt = require("jsonwebtoken");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");

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
    const userRowsNonAuth = await db.query("SELECT id, status, failed_login_attempts, suspension_end_at FROM users WHERE username = $1 AND status = 'active'", [username]);
    if (userRowsNonAuth.rowCount === 0) {
        log("warn", `Login failed - user not found or inactive for username: ${username}`, { function: "login" }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Invalid username or password" });
    }
    
    // First we get the user with no authentication to check for failed login attempts.
    const userNonAuth = userRowsNonAuth.rows[0];
    // If the user has 3 or more failed login attempts, block login.
    if(userNonAuth.failed_login_attempts >= 3) {
        log("warn", `Blocked login attempt for suspended user who has too many attempts with incorrect passwords. User id: ${userNonAuth.id}`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
        return res.status(403).json({ error: "Account is suspended due to multiple failed login attempts. Please contact the Administrator." });
    }

    // Now we check the password
    const userRows = await db.query("SELECT id, profile_image_url, suspension_end_at, status, temp_password, first_name, last_name FROM users WHERE password_hash = crypt($1, password_hash) AND username = $2", [password, username]);
    // If the password was correct, we'll have one row in userRows
    const user = userRows.rows[0];

    // if userNonAuth has a row but userRows does not, it means password is incorrect
    if(userNonAuth && userRows.rowCount === 0) {
        // increment failed login attempts
        let failedAttempts = userNonAuth.failed_login_attempts + 1;
        let suspensionEndAt = null;
        if(failedAttempts >= 3) {
            // suspend account indefinitely (effectively) - admin must unsuspend.
            const now = new Date();
            suspensionEndAt = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years from now
        }
        await db.query("UPDATE users SET failed_login_attempts = $1, suspension_end_at = $2 WHERE id = $3", [failedAttempts, suspensionEndAt, userNonAuth.id]);
    }

    // If no user found with that username/password
    if (userRows.rowCount === 0) {
        log("warn", `Failed login attempt for username: ${username}. Invalid username or password.`, { function: "login" }, utilities.getCallerInfo(), userNonAuth.id);
        return res.status(401).json({ error: "Invalid username or password" });
    }

    // If the user is suspended, block login
    if(user.status === "suspended") {
        const now = new Date();
        if(user.suspension_end_at && now < user.suspension_end_at) {
            log("warn", `Blocked login attempt for suspended user. User id: ${user.id}`, { function: "login" }, utilities.getCallerInfo(), user.id);
            return res.status(403).json({ error: `Account is suspended until ${user.suspension_end_at}` });
        }
    }

    // If the user is found, not suspended, and password is correct, create a JWT token and save it in the DB.
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    try {
        await db.transaction(async (client) => {
            // Update last login time and log the login event
            await client.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
            await client.query("INSERT INTO logged_in_users (user_id, token) VALUES ($1, $2)", [user.id, token]);
            // reset failed login attempts on successful login
            await client.query("UPDATE users SET failed_login_attempts = 0, suspension_end_at = NULL WHERE id = $1", [user.id]);
        });
    } catch (error) {
        log("error", `Login transaction failed for username ${username}: ${error}`, { function: "login" }, utilities.getCallerInfo(), user.id);
        return res.status(500).json({ error: "Login failed due to a server error" });
    }
    log("info", `User ${username} (ID: ${user.id}) logged in successfully`, { function: "login" }, utilities.getCallerInfo(), user.id);
    return res.json({ token: token, user_id: user.id, username: username, must_change_password: user.temp_password === true, fullName: `${user.first_name} ${user.last_name}` });
});

router.post("/logout", (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        log("warn", "Logout request missing Authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        log("warn", "Logout request invalid Authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Invalid Authorization header" });
    }
    const user_id = req.get("X-User-Id");
    if (!user_id) {
        log("warn", "Logout request missing X-User-Id header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Missing X-User-Id header" });
    }
    log("info", `Logout request received for user ID ${user_id}`, { function: "logout" }, utilities.getCallerInfo(), user_id);
    // Set the logout_at column for user to now()
    db.query("UPDATE logged_in_users SET logout_at = NOW() WHERE user_id = $1 AND token = $2", [user_id, token])
        .then(() => {
            log("info", `User ID ${user_id} logged out successfully`, { function: "logout" }, utilities.getCallerInfo(), user_id);
            res.json({ ok: true, message: "Logged out successfully" });
        })
        .catch((error) => {
            log("error", `Error during logout for user ID ${user_id}: ${error}`, { function: "logout" }, utilities.getCallerInfo(), user_id);
            console.error("Error during logout:", error);
            res.status(500).json({ error: "Internal server error" });
        });
});

module.exports = router;


