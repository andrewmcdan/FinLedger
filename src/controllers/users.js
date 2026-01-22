/**
 * This file contains functions relevant to user management.
 */

const db = require("../db/db");

// Placeholder function to check if a user is logged in. This should interface with the database functions in ../db/db.js
const getUserLoggedInStatus = async (user_id, token) => {
    const result = await db.query("SELECT * FROM logged_in_users WHERE user_id = $1 AND token = $2", [user_id, token]);
    if (result.rowCount === 0) {
        return false;
    }

    if (result.rows[0].logout_at < new Date()) {
        return false;
    }

    // update logout_at to extend session
    await db.query("UPDATE logged_in_users SET logout_at = now() + INTERVAL '1 hour' WHERE user_id = $1 AND token = $2", [user_id, token]);

    // return true if logged in
    return true; // placeholder
}

const isAdmin = async (userId) => {
    return db.query("SELECT role FROM users WHERE id = $1", [userId]).then((result) => {
        if (result.rowCount === 0) {
            return false;
        }
        return result.rows[0].role === "administrator";
    });
};

const getUserById = async (userId) => {
    const userResult = await db.query(
        "SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, profile_image_url, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE id = $1",
        [userId]
    );
    if (userResult.rowCount === 0) {
        return null;
    }
    return userResult.rows[0];
};

const listUsers = async () => {
    const usersResult = await db.query(
        "SELECT id, username, email, first_name, last_name, role, status, created_at, last_login_at FROM users ORDER BY id ASC"
    );
    return usersResult.rows;
};

const listLoggedInUsers = async () => {
    const loggedInUsersResult = await db.query("SELECT id, user_id, login_at, logout_at FROM logged_in_users ORDER BY id ASC");
    const uniqueLoggedInUsersMap = new Map();
    for (const row of loggedInUsersResult.rows) {
        if (row.logout_at < new Date()) {
            continue; // skip logged out users
        }
        if (!uniqueLoggedInUsersMap.has(row.user_id) || uniqueLoggedInUsersMap.get(row.user_id).login_at < row.login_at) {
            uniqueLoggedInUsersMap.set(row.user_id, row);
        }
    }
    const loggedInUsers = Array.from(uniqueLoggedInUsersMap.values());
    return loggedInUsers;
};

module.exports = {
    getUserLoggedInStatus,
    isAdmin,
    getUserById,
    listUsers,
    listLoggedInUsers,
};
