/**
 * This file contains functions relevant to user management.
 */

const db = require("../db/db");

// Placeholder function to check if a user is logged in. This should interface with the database functions in ../db/db.js
const getUserLoggedInStatus = async (user_id, token) => {
    const result = await db.query("SELECT * FROM logged_in_users WHERE user_id = $1 AND token = $2", [user_id, token]);
    if (result.rows.length === 0) {
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

module.exports = {
    getUserLoggedInStatus,
};