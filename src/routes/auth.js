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
    // Validate username and password
    // If valid, generate token and respond
    // If invalid, respond with error
    const userRows = await db.query("SELECT id, role, status, profile_image_url, failed_login_attempts, suspension_end_at FROM users WHERE password_hash = crypt($1, password_hash) AND username = $2", [password, username]);
    if (userRows.rowCount === 0) {
        return res.status(401).json({ error: "Invalid username or password" });
    }
    const user = userRows.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token: token, user_id: user.id, username: username });

    // Update last login time and log the login event
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    await db.query("INSERT INTO audit_logs (event_type, user_id) VALUES ($1, $2)", ["login", user.id]);
    await db.query("INSERT INTO logged_in_users (user_id, token) VALUES ($1, $2)", [user.id, token]);
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
