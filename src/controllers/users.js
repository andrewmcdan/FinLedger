/**
 * This file contains functions relevant to user management.
 */

const db = require("../db/db");
const fs = require("fs");
const path = require("path");

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
};

const isAdmin = async (userId) => {
    return db.query("SELECT role FROM users WHERE id = $1", [userId]).then((result) => {
        if (result.rowCount === 0) {
            return false;
        }
        return result.rows[0].role === "administrator";
    });
};

const getUserById = async (userId) => {
    const userResult = await db.query("SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, profile_image_url, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE id = $1", [userId]);
    if (userResult.rowCount === 0) {
        return null;
    }
    return userResult.rows[0];
};

const listUsers = async () => {
    const usersResult = await db.query("SELECT id, username, email, first_name, last_name, role, status, created_at, last_login_at FROM users ORDER BY id ASC");
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

const approveUser = async (userId) => {
    await db.query("UPDATE users SET status = 'active' WHERE id = $1", [userId]);
};

const rejectUser = async (userId) => {
    await db.query("UPDATE users SET status = 'rejected' WHERE id = $1", [userId]);
};

const suspendUser = async (userId, startDate, durationDays) => {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);
    await db.query("UPDATE users SET suspension_start_at = $1, suspension_end_at = $2, status = 'suspended' WHERE id = $3", [startDate, endDate, userId]);
};

/**
 *
 * @param {String} firstName
 * @param {String} lastName
 * @param {String} email
 * @param {String} password
 * @param {String} role - 'accountant', 'administrator', or 'manager'
 * @param {String} address
 * @param {Date} dateOfBirth
 * @param {String} profileImage - Absolute path to temp profile image
 * @returns
 */
const createUser = async (firstName, lastName, email, password, role, address, dateOfBirth, profileImage) => {
    // username should be made of the first name initial, the full last name, and a four digit (two-digit month and two-digit year) of when the account is created
    const username = `${firstName.charAt(0)}${lastName}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getFullYear()).slice(-2)}`;
    if (role !== "accountant" && role !== "administrator" && role !== "manager") {
        throw new Error("Invalid role specified");
    }
    let tempPasswordFlag = false;
    if(!password || password.length === 0){
        // Generate a random temporary password using lastname, dob, and a random number
        const randomNum = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
        const dobPart = new Date(dateOfBirth).toISOString().slice(5, 7) + new Date(dateOfBirth).toISOString().slice(2, 4);
        password = `${lastName}_${dobPart}_${randomNum}`;
        tempPasswordFlag = true;
    }
    if (firstName.length === 0 || lastName.length === 0 || email.length === 0) {
        throw new Error("First name, last name, email, and password cannot be empty");
    }

    const result = await db.query("INSERT INTO users (username, email, password_hash, first_name, last_name, role, address, date_of_birth, status, temp_password, created_at) VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6, $7, $8, 'pending', $9, now()) RETURNING id, profile_image_url, username", [username, email, password, firstName, lastName, role, address, dateOfBirth, tempPasswordFlag]);
    // Move temp profile image to permanent location in ./../../user-icons/ using the filename returned from the INSERT query
    const profileImageUrl = result.rows[0].profile_image_url;
    if (profileImage && profileImageUrl) {
        const destPath = path.join(__dirname, "../../user-icons/", profileImageUrl);
        fs.renameSync(profileImage, destPath);
    }
    // TODO: Send email to user with account details and temporary password if applicable
    return result.rows[0];
};

module.exports = {
    getUserLoggedInStatus,
    isAdmin,
    getUserById,
    listUsers,
    listLoggedInUsers,
    approveUser,
    createUser,
};
