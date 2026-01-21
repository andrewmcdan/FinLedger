/**
 * This file provides routes to get info about users (other than the current logged-in user).
 */

const path = require("path");
const express = require("express");
const router = express.Router();
const db = require("../db/db.js");

async function isAdmin(userId) {
    return await db.query("SELECT role FROM users WHERE id = $1", [userId])
        .then(result => {
            if (result.rowCount === 0) {
                return false;
            }
            return result.rows[0].role === "administrator";
        });
}


router.get("/get-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if(!await isAdmin(requestingUserId)) {
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

router.get("/list-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if(!await isAdmin(requestingUserId)) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const usersResult = await db.query("SELECT id, username, email, first_name, last_name, role, status, created_at, last_login_at FROM users ORDER BY id ASC");
    return res.json({ users: usersResult.rows });
});

router.get("/get-logged-in-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if(!await isAdmin(requestingUserId)) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const loggedInUsersResult = await db.query("SELECT id, user_id, login_at FROM logged_in_users ORDER BY id ASC");
    return res.json({ logged_in_users: loggedInUsersResult.rows });
});

module.exports = router;