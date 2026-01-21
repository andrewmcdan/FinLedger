const express = require("express");
const { getUserLoggedInStatus } = require("../controllers/users.js");
const router = express.Router();
const db = require("../db/db.js");
const jwt = require("jsonwebtoken");

router.use(express.json());

// Endpoint to check if user is logged in
router.get("/status", async (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        return res.json({ ok: false, loggedIn: false });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.json({ ok: false, loggedIn: false });
    }
    const user_id = req.get("user_id");
    if (!user_id) {
        return res.json({ ok: false, loggedIn: false });
    }
    req.user = { token: token, id: user_id };
    const loggedIn = await getUserLoggedInStatus(user_id, token);
    console.log(loggedIn);
    res.json({ ok: true, loggedIn: loggedIn });
});

router.post("/login", async (req, res) => {
    // Implement login logic here
    const { username, password } = req.body;
    const userRowsNonAuth = await db.query("SELECT id, status, failed_login_attempts, suspension_end_at FROM users WHERE username = $1 AND status = 'active'", [username]);
    if (userRowsNonAuth.rowCount === 0) {
        return res.status(401).json({ error: "Invalid username or password" });
    }
    
    // First we get the user with no authentication to check for failed login attempts.
    const userNonAuth = userRowsNonAuth.rows[0];
    // If the user has 3 or more failed login attempts, block login.
    if(userNonAuth.failed_login_attempts >= 3) {
        return res.status(403).json({ error: "Account is suspended due to multiple failed login attempts. Please contact the Administrator." });
    }

    // Now we check the password
    const userRows = await db.query("SELECT id, profile_image_url, suspension_end_at FROM users WHERE password_hash = crypt($1, password_hash) AND username = $2", [password, username]);
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
        return res.status(401).json({ error: "Invalid username or password" });
    }

    // If the user is suspended, block login
    if(user.status === "suspended") {
        const now = new Date();
        if(user.suspension_end_at && now < user.suspension_end_at) {
            return res.status(403).json({ error: `Account is suspended until ${user.suspension_end_at}` });
        }
    }

    // If the user is found, not suspended, and password is correct, create a JWT token and save it in the DB.
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    // Update last login time and log the login event
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    await db.query("INSERT INTO audit_logs (event_type, user_id) VALUES ($1, $2)", ["login", user.id]);
    await db.query("INSERT INTO logged_in_users (user_id, token) VALUES ($1, $2)", [user.id, token]);

    return res.json({ token: token, user_id: user.id, username: username });
});

router.post("/logout", (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid Authorization header" });
    }
    const user_id = req.get("user_id");
    if (!user_id) {
        return res.status(401).json({ error: "Missing User_id header" });
    }
    // Set the logout_at column for user to now()
    db.query("UPDATE logged_in_users SET logout_at = NOW() WHERE user_id = $1 AND token = $2", [user_id, token])
        .then(() => {
            res.json({ ok: true, message: "Logged out successfully" });
        })
        .catch((error) => {
            console.error("Error during logout:", error);
            res.status(500).json({ error: "Internal server error" });
        });
});

module.exports = router;
