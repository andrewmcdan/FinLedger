/**
 * This file contains functions relevant to user management.
 */

const db = require("../db/db");
const fs = require("fs");
const path = require("path");
const logger = require("./../utils/logger");
const utilities = require("./../utils/utilities");
const { sendEmail } = require("./../services/email");

function checkPasswordComplexity(password) {
    if (password.length < 8) {
        return false;
    }
    const startsWithLetterRegex = /^[A-Za-z]/;
    const uppercaseRegex = /[A-Z]/;
    const lowercaseRegex = /[a-z]/;
    const digitRegex = /[0-9]/;
    const specialCharRegex = /[~!@#$%^&*()_+|}{":?><,./;'[\]\\=-]/;
    if (!startsWithLetterRegex.test(password) || !uppercaseRegex.test(password) || !lowercaseRegex.test(password) || !digitRegex.test(password) || !specialCharRegex.test(password)) {
        return false;
    }
    return true;
}

const buildUsernameBase = (firstName, lastName, date = new Date()) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${firstName.charAt(0)}${lastName}${month}${year}`;
};

const alphaSuffixToNumber = (suffix) => {
    if (!suffix || !/^[A-Z]+$/.test(suffix)) {
        return null;
    }
    let value = 0;
    for (const char of suffix) {
        value = value * 26 + (char.charCodeAt(0) - 64);
    }
    return value;
};

const numberToAlphaSuffix = (value) => {
    let nextValue = Number(value);
    if (!Number.isInteger(nextValue) || nextValue <= 0) {
        throw new Error(`Invalid suffix value: ${value}`);
    }
    let suffix = "";
    while (nextValue > 0) {
        nextValue -= 1;
        suffix = String.fromCharCode(65 + (nextValue % 26)) + suffix;
        nextValue = Math.floor(nextValue / 26);
    }
    return suffix;
};

const generateUniqueUsername = async (client, firstName, lastName) => {
    const baseUsername = buildUsernameBase(firstName, lastName);
    const suffixResult = await client.query(
        `SELECT username
         FROM users
         WHERE username = $1
            OR LEFT(username, LENGTH($1)) = $1`,
        [baseUsername],
    );

    let baseTaken = false;
    let maxSuffixNumber = 0;
    for (const row of suffixResult.rows) {
        const username = row.username || "";
        if (username === baseUsername) {
            baseTaken = true;
            continue;
        }
        if (!username.startsWith(baseUsername)) {
            continue;
        }
        const suffix = username.slice(baseUsername.length);
        if (!suffix) {
            continue;
        }
        const suffixNumber = alphaSuffixToNumber(String(suffix).toUpperCase());
        if (suffixNumber) {
            maxSuffixNumber = Math.max(maxSuffixNumber, suffixNumber);
        }
    }

    if (!baseTaken) {
        return baseUsername;
    }

    return `${baseUsername}${numberToAlphaSuffix(maxSuffixNumber + 1)}`;
};

const isUsernameUniqueViolation = (error) => {
    if (error?.code !== "23505") {
        return false;
    }
    if (error?.constraint === "users_username_key") {
        return true;
    }
    return typeof error?.detail === "string" && error.detail.includes("(username)=");
};

const getUserLoggedInStatus = async (user_id, token) => {
    logger.log("trace", "Checking logged-in status", { user_id }, utilities.getCallerInfo(), user_id);
    const result = await db.query("SELECT * FROM logged_in_users WHERE user_id = $1 AND token = $2", [user_id, token]);
    if (result.rowCount === 0) {
        logger.log("trace", "No active session found", { user_id }, utilities.getCallerInfo(), user_id);
        return false;
    }
    if (result.rows[0].logout_at < new Date()) {
        logger.log("trace", "Session expired", { user_id }, utilities.getCallerInfo(), user_id);
        return false;
    }
    await db.query("UPDATE logged_in_users SET logout_at = now() + INTERVAL '1 hour' WHERE user_id = $1 AND token = $2", [user_id, token]);
    logger.log("trace", "Extended session expiration", { user_id }, utilities.getCallerInfo(), user_id);
    return true;
};

const isAdmin = async (userId, token) => {
    logger.log("trace", `Checking if user ${userId} is an administrator`, { function: "isAdmin" }, utilities.getCallerInfo(), userId);
    if (!token) {
        return false;
    }
    const loggedIn = await getUserLoggedInStatus(userId, token);
    if (!loggedIn) {
        return false;
    }
    return db.query("SELECT role FROM users WHERE id = $1", [userId]).then((result) => {
        if (result.rowCount === 0) {
            return false;
        }
        return result.rows[0].role === "administrator";
    });
};

const isManager = async (userId, token) => {
    logger.log("trace", `Checking if user ${userId} is a manager`, { function: "isManager" }, utilities.getCallerInfo(), userId);
    if (!token) {
        return false;
    }
    const loggedIn = await getUserLoggedInStatus(userId, token);
    if (!loggedIn) {
        return false;
    }
    return db.query("SELECT role FROM users WHERE id = $1", [userId]).then((result) => {
        if (result.rowCount === 0) {
            return false;
        }
        return result.rows[0].role === "manager";
    });
};

const getUserById = async (userId) => {
    logger.log("debug", "Fetching user by ID", { userId }, utilities.getCallerInfo(), userId);
    const userResult = await db.query("SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, user_icon_path, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE id = $1", [userId]);
    if (userResult.rowCount === 0) {
        logger.log("warn", "User not found by ID", { userId }, utilities.getCallerInfo(), userId);
        return null;
    }
    return userResult.rows[0];
};

const getUserByEmail = async (email) => {
    logger.log("debug", "Fetching user by email", { email }, utilities.getCallerInfo());
    const userResult = await db.query("SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, user_icon_path, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE email = $1", [email]);
    if (userResult.rowCount === 0) {
        logger.log("warn", "User not found by email", { email }, utilities.getCallerInfo());
        return null;
    }
    return userResult.rows[0];
};

const getUserByResetToken = async (resetToken) => {
    logger.log("debug", "Fetching user by reset token", {}, utilities.getCallerInfo());
    const userResult = await db.query(
        "SELECT id, username, email, first_name, last_name, reset_failed_attempts FROM users WHERE reset_token = $1 AND reset_token_expires_at > now()",
        [resetToken],
    );
    if (userResult.rowCount === 0) {
        logger.log("warn", "User not found by reset token", {}, utilities.getCallerInfo());
        return null;
    }
    return userResult.rows[0];
};

const listUsers = async () => {
    logger.log("debug", "Listing users", {}, utilities.getCallerInfo());
    const usersResult = await db.query("SELECT id, username, email, first_name, last_name, role, status, created_at, last_login_at, suspension_start_at, suspension_end_at, address, user_icon_path, temp_password, password_expires_at FROM users ORDER BY id ASC");
    logger.log("debug", "Users listed", { count: usersResult.rowCount }, utilities.getCallerInfo());
    return usersResult.rows;
};

const listAdministratorContacts = async (excludeUserId = null) => {
    logger.log("debug", "Listing administrator contacts", { excludeUserId }, utilities.getCallerInfo());
    const values = [];
    let whereClause = "role = 'administrator' AND email IS NOT NULL AND email <> ''";
    if (excludeUserId !== null && excludeUserId !== undefined) {
        values.push(excludeUserId);
        whereClause += " AND id <> $1";
    }
    const adminResult = await db.query(`SELECT id, email, first_name FROM users WHERE ${whereClause} ORDER BY id ASC`, values);
    logger.log("debug", "Administrator contacts listed", { count: adminResult.rowCount }, utilities.getCallerInfo());
    return adminResult.rows;
};

const listLoggedInUsers = async () => {
    logger.log("debug", "Listing logged-in users", {}, utilities.getCallerInfo());
    const loggedInUsersResult = await db.query("SELECT id, user_id, login_at, logout_at FROM logged_in_users ORDER BY id ASC");
    const uniqueLoggedInUsersMap = new Map();
    for (const row of loggedInUsersResult.rows) {
        if (row.logout_at < new Date()) {
            continue;
        }
        if (!uniqueLoggedInUsersMap.has(row.user_id) || uniqueLoggedInUsersMap.get(row.user_id).login_at < row.login_at) {
            uniqueLoggedInUsersMap.set(row.user_id, row);
        }
    }
    const loggedInUsers = Array.from(uniqueLoggedInUsersMap.values());
    logger.log("debug", "Logged-in users listed", { count: loggedInUsers.length }, utilities.getCallerInfo());
    return loggedInUsers;
};

const approveUser = async (userId) => {
    logger.log("info", `Approving user with ID ${userId}`, { function: "approveUser" }, utilities.getCallerInfo(), userId);
    await db.query("UPDATE users SET status = 'active', updated_at = now() WHERE id = $1", [userId]);
};

const rejectUser = async (userId) => {
    logger.log("info", `Rejecting user with ID ${userId}`, { function: "rejectUser" }, utilities.getCallerInfo(), userId);
    await db.query("UPDATE users SET status = 'rejected', updated_at = now() WHERE id = $1", [userId]);
};

const suspendUser = async (userId, suspensionStart, suspensionEnd) => {
    logger.log("info", `Suspending user with ID ${userId} from ${suspensionStart} to ${suspensionEnd}`, { function: "suspendUser" }, utilities.getCallerInfo(), userId);
    await db.query("UPDATE users SET suspension_start_at = $1, suspension_end_at = $2, status = 'suspended', updated_at = now() WHERE id = $3", [suspensionStart, suspensionEnd, userId]);
};

const reinstateUser = async (userId) => {
    logger.log("info", `Reinstating user with ID ${userId}`, { function: "reinstateUser" }, utilities.getCallerInfo(), userId);
    await db.query("UPDATE users SET status = 'active', suspension_start_at = NULL, suspension_end_at = NULL, updated_at = now() WHERE id = $1", [userId]);
};

const changePassword = async (userId, newPassword) => {
    if (decodeURIComponent(newPassword) !== newPassword) {
        newPassword = decodeURIComponent(newPassword);
    }
    if (!checkPasswordComplexity(newPassword)) {
        logger.log("warn", "Password complexity check failed", { userId }, utilities.getCallerInfo(), userId);
        const error = new Error("Password does not meet complexity requirements");
        error.code = "ERR_PASSWORD_COMPLEXITY";
        throw error;
    }
    await db.transaction(async (client) => {
        const pastPasswordsResult = await client.query("SELECT password_hash FROM password_history WHERE user_id = $1", [userId]);
        for (const row of pastPasswordsResult.rows) {
            const matchResult = await client.query("SELECT 1 FROM users WHERE password_hash = crypt($1, $2) AND id = $3", [newPassword, row.password_hash, userId]);
            if (matchResult.rows.length > 0) {
                const error = new Error("New password cannot be the same as any past passwords");
                error.code = "ERR_PASSWORD_HISTORY_REUSE";
                throw error;
            }
        }
        logger.log("info", `Changing password for user with ID ${userId}`, { function: "changePassword" }, utilities.getCallerInfo(), userId);
        const result = await client.query("UPDATE users SET password_hash = crypt($1, gen_salt('bf')), temp_password = false, password_changed_at = now(), password_expires_at = now() + interval '90 days', updated_at = now() WHERE id = $2 RETURNING password_hash", [newPassword, userId]);
        await savePasswordToHistory(userId, result.rows[0].password_hash, client);
    });
    logger.log("info", "Password changed successfully", { userId }, utilities.getCallerInfo(), userId);
};

const verifyCurrentPassword = async (userId, currentPassword) => {
    const result = await db.query("SELECT 1 FROM users WHERE id = $1 AND password_hash = crypt($2, password_hash)", [userId, currentPassword]);
    if (result.rowCount === 0) {
        logger.log("debug", "Current password verification failed", { userId }, utilities.getCallerInfo(), userId);
    }
    return result.rowCount > 0;
};

const changePasswordWithCurrentPassword = async (userId, currentPassword, newPassword) => {
    const verified = await verifyCurrentPassword(userId, currentPassword);
    if (!verified) {
        logger.log("warn", "Current password verification failed during password change", { userId }, utilities.getCallerInfo(), userId);
        const error = new Error("Current password is incorrect");
        error.code = "INVALID_CURRENT_PASSWORD";
        throw error;
    }
    await changePassword(userId, newPassword);
};

const updateSecurityQuestionsWithCurrentPassword = async (userId, currentPassword, securityQuestions) => {
    const verified = await verifyCurrentPassword(userId, currentPassword);
    if (!verified) {
        logger.log("warn", "Current password verification failed during security question update", { userId }, utilities.getCallerInfo(), userId);
        const error = new Error("Current password is incorrect");
        error.code = "INVALID_CURRENT_PASSWORD";
        throw error;
    }
    await updateSecurityQuestions(userId, securityQuestions);
};

const updateUserProfile = async (userId, profileUpdates) => {
    const fields = {
        first_name: profileUpdates.first_name,
        last_name: profileUpdates.last_name,
        email: profileUpdates.email,
        address: profileUpdates.address,
        user_icon_path: profileUpdates.user_icon_path,
        role: profileUpdates.role,
        status: profileUpdates.status,
        suspension_start_at: profileUpdates.suspension_start_at,
        suspension_end_at: profileUpdates.suspension_end_at,
    };

    const updates = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined) {
            logger.log("debug", `Skipping undefined profile field ${key} for user with ID ${userId}`, { function: "updateUserProfile" }, utilities.getCallerInfo(), userId);
            return;
        }
        updates.push(`${key} = $${values.length + 1}`);
        values.push(value);
    });

    if (!updates.length) {
        logger.log("info", `No profile updates provided for user with ID ${userId}`, { function: "updateUserProfile" }, utilities.getCallerInfo(), userId);
        return null;
    }

    values.push(userId);
    updates.push(`updated_at = now()`);
    const query = `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING id, email, first_name, last_name, address, user_icon_path`;
    const result = await db.query(query, values);
    if (result.rowCount === 0) {
        logger.log("warn", `No user found with ID ${userId} to update profile`, { function: "updateUserProfile" }, utilities.getCallerInfo(), userId);
        return null;
    }
    logger.log("info", `Updated profile for user with ID ${userId}`, { function: "updateUserProfile" }, utilities.getCallerInfo(), userId);
    return result.rows[0];
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
    logger.log("info", "Creating user", { email, role }, utilities.getCallerInfo());
    if (role !== "accountant" && role !== "administrator" && role !== "manager") {
        logger.log("error", `Invalid role specified when creating user: ${role}`, { function: "createUser" }, utilities.getCallerInfo());
        throw new Error("Invalid role specified");
    }
    let tempPasswordFlag = false;
    if (!password || password.length === 0) {
        // Generate a random temporary password using lastname, dob, and a random number
        const randomNum = Math.floor(100000000 + Math.random() * 900000000); // 9 digit random number
        const dobPart = new Date(dateOfBirth).toISOString().slice(5, 7) + new Date(dateOfBirth).toISOString().slice(2, 4);
        password = `${lastName}_${dobPart}_${randomNum}`;
        tempPasswordFlag = true;
    }
    if (firstName.length === 0 || lastName.length === 0 || email.length === 0) {
        logger.log("error", "First name, last name, email, and password cannot be empty when creating user", { function: "createUser" }, utilities.getCallerInfo());
        throw new Error("First name, last name, email, and password cannot be empty");
    }

    let createdUser = null;
    const maxUsernameInsertAttempts = 5;
    for (let attempt = 1; attempt <= maxUsernameInsertAttempts; attempt += 1) {
        try {
            createdUser = await db.transaction(async (client) => {
                const username = await generateUniqueUsername(client, firstName, lastName);
                const result = await client.query(
                    "INSERT INTO users (username, email, password_hash, first_name, last_name, role, address, date_of_birth, status, temp_password, created_at, password_changed_at, password_expires_at, user_icon_path) VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6, $7, $8, 'pending', $9, now(), now(), now() + interval '90 days', gen_random_uuid()) RETURNING id, user_icon_path, username, password_hash, user_icon_path",
                    [username, email, password, firstName, lastName, role, address, dateOfBirth, tempPasswordFlag],
                );
                await savePasswordToHistory(result.rows[0].id, result.rows[0].password_hash, client);
                return result.rows[0];
            });
            break;
        } catch (error) {
            if (attempt === maxUsernameInsertAttempts || !isUsernameUniqueViolation(error)) {
                throw error;
            }
            logger.log("warn", "Username collision detected during user creation; retrying", { email, attempt }, utilities.getCallerInfo());
        }
    }

    if (!createdUser) {
        throw new Error("Failed to generate a unique username");
    }

    logger.log("info", "User created", { userId: createdUser.id, username: createdUser.username, role }, utilities.getCallerInfo(), createdUser.id);
    const userIconPath = createdUser.user_icon_path;
    if (profileImage && profileImage != null && profileImage !== "" && profileImage !== "null" && userIconPath) {
        logger.log("info", `Moving profile image for new user with ID ${createdUser.id}`, { function: "createUser" }, utilities.getCallerInfo(), createdUser.id);
        const sourcePath = path.join(__dirname, "../../user-icons/", path.basename(profileImage));
        const destPath = path.join(__dirname, "../../user-icons/", userIconPath);
        fs.renameSync(sourcePath, destPath);
    }
    if (tempPasswordFlag) {
        const emailSubject = "Your FinLedger Account Has Been Created";
        const emailBody = `Dear ${firstName} ${lastName},\n\nYour FinLedger account has been created successfully.\n\nUsername: ${createdUser.username}\nTemporary Password: ${password}\n\nPlease log in and change your password at your earliest convenience.\n\nBest regards,\nFinLedger Team`;
        let result = await sendEmail(email, emailSubject, emailBody);
        logger.log("info", `Sent account creation email to ${email} with result: ${JSON.stringify(result)}`, { function: "createUser" }, utilities.getCallerInfo());
    }
    return createdUser;
};

const savePasswordToHistory = async (userId, passwordHash, client = null) => {
    const executor = client || db;
    await executor.query("INSERT INTO password_history (user_id, password_hash, changed_at) VALUES ($1, $2, now())", [userId, passwordHash]);
};

const updateSecurityQuestions = async (userId, questionsAndAnswers) => {
    // questionsAndAnswers should be an array of objects with 'question' and 'answer' properties
    // The table has rows like this:   security_question_1 TEXT, security_answer_hash_1 TEXT, security_question_2 TEXT, security_answer_hash_2 TEXT, security_question_3 TEXT, security_answer_hash_3 TEXT,
    if (questionsAndAnswers.length !== 3) {
        logger.log("warn", "Invalid security question payload length", { userId, length: questionsAndAnswers.length }, utilities.getCallerInfo(), userId);
        const error = new Error("Exactly three security questions and answers must be provided");
        error.code = "ERR_EXACTLY_THREE_SECURITY_QA_REQUIRED";
        throw error;
    }
    const query = "UPDATE users SET security_question_1 = $1, security_answer_hash_1 = crypt($2, gen_salt('bf')), security_question_2 = $3, security_answer_hash_2 = crypt($4, gen_salt('bf')), security_question_3 = $5, security_answer_hash_3 = crypt($6, gen_salt('bf')), updated_at = now() WHERE id = $7";
    const values = [questionsAndAnswers[0].question, questionsAndAnswers[0].answer, questionsAndAnswers[1].question, questionsAndAnswers[1].answer, questionsAndAnswers[2].question, questionsAndAnswers[2].answer, userId];
    await db.query(query, values);
    logger.log("info", `Updated security questions for user with ID ${userId}`, { function: "updateSecurityQuestions" }, utilities.getCallerInfo(), userId);
};

const getSecurityQuestionsForUser = async (userId) => {
    logger.log("debug", "Fetching security questions for user", { userId }, utilities.getCallerInfo(), userId);
    const result = await db.query("SELECT security_question_1, security_question_2, security_question_3 FROM users WHERE id = $1", [userId]);
    if (result.rowCount === 0) {
        logger.log("warn", "Security questions not found for user", { userId }, utilities.getCallerInfo(), userId);
        return null;
    }
    return {
        security_question_1: result.rows[0].security_question_1,
        security_question_2: result.rows[0].security_question_2,
        security_question_3: result.rows[0].security_question_3,
    };
};

const verifySecurityAnswers = async (userId, answers) => {
    // answers should be an array of strings with the answers to the security questions in order
    if (answers.length !== 3) {
        logger.log("warn", "Invalid security answer payload length", { userId, length: answers.length }, utilities.getCallerInfo(), userId);
        const error = new Error("Exactly three answers must be provided");
        error.code = "ERR_EXACTLY_THREE_SECURITY_QA_REQUIRED";
        throw error;
    }
    const query = "SELECT 1 FROM users WHERE id = $1 AND security_answer_hash_1 = crypt($2, security_answer_hash_1) AND security_answer_hash_2 = crypt($3, security_answer_hash_2) AND security_answer_hash_3 = crypt($4, security_answer_hash_3)";
    const values = [userId, answers[0], answers[1], answers[2]];
    const result = await db.query(query, values);
    return result.rowCount > 0;
};

const logoutInactiveUsers = async () => {
    const result = await db.query("DELETE FROM logged_in_users WHERE logout_at < now()");
    logger.log("info", "Logged out inactive users: " + result.rowCount, { function: "logoutInactiveUsers" }, utilities.getCallerInfo());
};

const unsuspendExpiredSuspensions = async () => {
    const result = await db.query("UPDATE users SET status = 'active', suspension_start_at = NULL, suspension_end_at = NULL, updated_at = now() WHERE suspension_end_at < now() AND status = 'suspended'");
    logger.log("info", "Unsuspended users with expired suspensions: " + result.rowCount, { function: "unsuspendExpiredSuspensions" }, utilities.getCallerInfo());
};

const sendPasswordExpiryWarnings = async () => {
    const warningThresholdDays = 3;
    logger.log("debug", "Sending password expiry warnings", { warningThresholdDays }, utilities.getCallerInfo());
    const result = await db.query("SELECT id, email, first_name, last_name, password_expires_at FROM users WHERE password_expires_at IS NOT NULL AND password_expires_at <= now() + ($1 * interval '1 day') AND password_expires_at > now()", [warningThresholdDays]);
    const trackingResult = await db.query("SELECT pet.user_id, pet.password_expires_at, pet.email_sent_at FROM password_expiry_email_tracking pet JOIN users u ON u.id = pet.user_id WHERE u.password_expires_at IS NOT NULL AND u.password_expires_at <= now() + ($1 * interval '1 day') AND u.password_expires_at > now()", [warningThresholdDays]);
    const warnedWithin24Hours = new Set();
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    for (const row of trackingResult.rows) {
        if (row.email_sent_at && row.email_sent_at.getTime() >= cutoffTime) {
            warnedWithin24Hours.add(row.user_id);
        }
    }

    const pendingWarnings = result.rows.filter((row) => !warnedWithin24Hours.has(row.id));
    logger.log("debug", "Password expiry warnings queued", { pendingCount: pendingWarnings.length }, utilities.getCallerInfo());

    for (const row of pendingWarnings) {
        const trackResult = await db.query("INSERT INTO password_expiry_email_tracking (user_id, password_expires_at) VALUES ($1, $2) ON CONFLICT (user_id, password_expires_at, email_sent_date) DO NOTHING RETURNING id", [row.id, row.password_expires_at]);
        if (trackResult.rowCount === 0) {
            continue;
        }
        const daysLeft = Math.ceil((row.password_expires_at - new Date()) / (1000 * 60 * 60 * 24));
        const emailSubject = "Password Expiration Warning";
        const emailBody = `Dear ${row.first_name} ${row.last_name},\n\nThis is a reminder that your password will expire in ${daysLeft} day(s) on ${row.password_expires_at.toDateString()}.\n\nPlease log in and change your password to avoid any disruption to your account access.\n\nBest regards,\nFinLedger Team`;
        let emailResult = await sendEmail(row.email, emailSubject, emailBody);
        logger.log("info", `Sent password expiration warning email to ${row.email} with result: ${JSON.stringify(emailResult)}`, { function: "sendPasswordExpiryWarnings" }, utilities.getCallerInfo(), row.id);
    }
    logger.log("debug", "Password expiry warnings complete", { processedCount: pendingWarnings.length }, utilities.getCallerInfo());
};

const suspendUsersWithExpiredPasswords = async () => {
    logger.log("debug", "Suspending users with expired passwords", {}, utilities.getCallerInfo());
    const result = await db.query("UPDATE users SET status = 'suspended', suspension_start_at = now(), suspension_end_at = NULL, updated_at = now() WHERE password_expires_at <= now() AND status != 'suspended' RETURNING id, email, first_name, last_name");
    for (const row of result.rows) {
        const emailSubject = "Account Suspended Due to Expired Password";
        const emailBody = `Dear ${row.first_name} ${row.last_name},\n\nYour account has been suspended because your password has expired. Please contact the system administrator to reinstate your account and set a new password.\n\nBest regards,\nFinLedger Team`;
        let emailResult = await sendEmail(row.email, emailSubject, emailBody);
        // update password_expiry_email_tracking to log this suspension email
        const passwordExpiresAtResult = await db.query("SELECT password_expires_at FROM users WHERE id = $1", [row.id]);
        await db.query("INSERT INTO password_expiry_email_tracking (user_id, password_expires_at) VALUES ($1, $2)", [row.id, passwordExpiresAtResult.rows[0].password_expires_at]);
        logger.log("info", `Sent account suspension email to ${row.email} with result: ${JSON.stringify(emailResult)}`, { function: "suspendUsersWithExpiredPasswords" }, utilities.getCallerInfo(), row.id);
    }
    logger.log("info", "Suspended users with expired passwords: " + result.rowCount, { function: "suspendUsersWithExpiredPasswords" }, utilities.getCallerInfo());
    logger.log("debug", "Expired password suspension complete", { suspendedCount: result.rowCount }, utilities.getCallerInfo());
};

const deleteUserById = async (userId) => {
    logger.log("info", `Deleting user with ID ${userId}`, { function: "deleteUserById" }, utilities.getCallerInfo());
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
};

const setUserPassword = async (userId, password, temp = false) => {
    if (!checkPasswordComplexity(password)) {
        logger.log("warn", "Password complexity check failed for setUserPassword", { userId, temp }, utilities.getCallerInfo(), userId);
        const error = new Error("Password does not meet complexity requirements");
        error.code = "ERR_PASSWORD_COMPLEXITY";
        throw error;
    }
    logger.log("info", "Setting user password", { userId, temp }, utilities.getCallerInfo(), userId);
    return db.transaction(async (client) => {
        const result = await client.query("SELECT crypt($1, gen_salt('bf')) AS password_hash", [password]);
        const passwordHash = result.rows[0].password_hash;
        const result2 = await client.query("UPDATE users SET password_hash = $1, temp_password = $2, password_changed_at = now(), password_expires_at = now() + ($3 * interval '15 minutes'), updated_at = now() WHERE id = $4", [passwordHash, temp, temp ? 1 : 90 * 24 * 60, userId]);
        await savePasswordToHistory(userId, passwordHash, client);
        return result2.rowCount > 0;
    });
};

const getUserByUsername = async (username) => {
    logger.log("debug", "Fetching user by username", { username }, utilities.getCallerInfo());
    const userResult = await db.query("SELECT id, username, email, first_name, last_name, address, date_of_birth, role, status, user_icon_path, password_expires_at, created_at, suspension_start_at, suspension_end_at, failed_login_attempts, last_login_at FROM users WHERE username = $1", [username]);
    if (userResult.rowCount === 0) {
        logger.log("warn", "User not found by username", { username }, utilities.getCallerInfo());
        return null;
    }
    return userResult.rows[0];
};

module.exports = {
    getUserLoggedInStatus,
    isAdmin,
    isManager,
    getUserById,
    listUsers,
    listAdministratorContacts,
    listLoggedInUsers,
    approveUser,
    createUser,
    rejectUser,
    suspendUser,
    reinstateUser,
    changePassword,
    changePasswordWithCurrentPassword,
    updateSecurityQuestionsWithCurrentPassword,
    updateUserProfile,
    getUserByEmail,
    updateSecurityQuestions,
    getSecurityQuestionsForUser,
    verifySecurityAnswers,
    getUserByResetToken,
    logoutInactiveUsers,
    unsuspendExpiredSuspensions,
    sendPasswordExpiryWarnings,
    suspendUsersWithExpiredPasswords,
    deleteUserById,
    setUserPassword,
    getUserByUsername,
};
