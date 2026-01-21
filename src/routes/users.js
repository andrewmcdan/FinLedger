/**
 * This file provides routes to get info about users (other than the current logged-in user).
 */

const path = require("path");
const express = require("express");
const router = express.Router();
const db = require("../db/db.js");

router.get("/get-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    // get the user from the db to check if they are administrator
    const result = await db.query("SELECT id, role FROM users WHERE id = $1", [requestingUserId]);
    if (result.rowCount === 0) {
        return res.json({ error: "Requesting user not found" });
    }
    const user = result.rows[0];
    // Check that the requesting user is an administrator
    if (user.role !== "administrator") {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToGet = req.params.userId;
    const userResult = await db.query("SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, profile_image_url, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE id = $1", [userIdToGet]);
    if (userResult.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
    }
    const userData = userResult.rows[0];
    return res.json({ user: userData });
});



module.exports = router;