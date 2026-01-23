/**
 * This file provides routes to get info about users (other than the current logged-in user).
 */

const express = require("express");
const router = express.Router();
const { getUserLoggedInStatus, isAdmin, getUserById, listUsers, listLoggedInUsers, approveUser, createUser, rejectUser, suspendUser, changePassword, getUserByEmail, updateSecurityQuestions, getSecurityQuestionsForUser, verifySecurityAnswers, getUserByResetToken } = require("../controllers/users.js");
const logger = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendEmail } = require("../services/email.js");
const db = require("../db/db.js");

router.get("/get-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToGet = req.params.userId;
    const userData = await getUserById(userIdToGet);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: userData });
});

router.get("/list-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const users = await listUsers();
    return res.json({ users });
});

router.get("/get-logged-in-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const loggedInUsers = await listLoggedInUsers();
    return res.json({ logged_in_users: loggedInUsers });
});

router.get("/approve-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToApprove = req.params.userId;
    const userData = await getUserById(userIdToApprove);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "pending") {
        return res.status(400).json({ error: "User is not pending approval" });
    }
    await approveUser(userIdToApprove);
    logger.log("info", `User ID ${userIdToApprove} approved by admin user ID ${requestingUserId}`, { function: "approve-user" }, utilities.getCallerInfo());
    const emailResult = await sendEmail(userData.email, "Your FinLedger Account Has Been Approved", `Dear ${userData.first_name},\n\nWe are pleased to inform you that your FinLedger account has been approved by our administration team. You can now log in with your username and start using our services.\n\nUsername: ${userData.username}\n\nBest regards,\nThe FinLedger Team\n\n`);
    if (!emailResult.accepted || emailResult.accepted.length === 0) {
        logger.log("warn", `Failed to send approval email to ${userData.email} for user ID ${userIdToApprove}`, { function: "approve-user" }, utilities.getCallerInfo());
    }
    return res.json({ message: "User approved successfully" });
});

router.get("/reject-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReject = req.params.userId;
    const userData = await getUserById(userIdToReject);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "pending") {
        return res.status(400).json({ error: "User is not pending approval" });
    }
    rejectUser(userIdToReject);
    return res.json({ message: "User rejected successfully" });
});

router.post("/create-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    logger.log("info", `User ID ${requestingUserId} is attempting to create a new user`, { function: "create-user" }, utilities.getCallerInfo());
    if (!(await isAdmin(requestingUserId))) {
        logger.log("warn", `Access denied for user ID ${requestingUserId} to create a new user. Administrator role required.`, { function: "create-user" }, utilities.getCallerInfo());
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { first_name, last_name, email, password, role, address, date_of_birth, user_icon_name } = req.body;
    try {
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, user_icon_name);
        logger.log("info", `New user created with ID ${newUser.id} by admin user ID ${requestingUserId}`, { function: "create-user" }, utilities.getCallerInfo());
        return res.json({ user: newUser });
    } catch (error) {
        logger.log("error", `Error creating user by admin user ID ${requestingUserId}: ${error}`, { function: "create-user" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to create user" });
    }
});

router.post("/changePassword", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const { newPassword, securityAnswers } = req.body;
    const verified = await verifySecurityAnswers(requestingUserId, securityAnswers);
    if (!verified) {
        logger.log("warn", `Security answers verification failed for user ID ${requestingUserId} during password change`, { function: "changePassword" }, utilities.getCallerInfo());
        return res.status(403).json({ error: "Security answers verification failed" });
    }
    try {
        await changePassword(requestingUserId, newPassword);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        logger.log("error", `Error changing password for user ID ${requestingUserId}: ${error}`, { function: "changePassword" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to change password" });
    }
});

router.post("/register_new_user", async (req, res) => {
    const { first_name, last_name, email, password, address, date_of_birth, role, security_question_1, security_answer_1, security_question_2, security_answer_2, security_question_3, security_answer_3 } = req.body;
    console.log({ first_name, last_name, email, password, address, date_of_birth, role, security_question_1, security_answer_1, security_question_2, security_answer_2, security_question_3, security_answer_3 });
    try {
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, null);
        logger.log("info", `New user registered with ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo());
        const emailResult = await sendEmail(email, "Welcome to FinLedger - Registration Successful", `Dear ${first_name},\n\nThank you for registering with FinLedger. Your account is currently pending approval by an administrator. You will receive another email once your account has been approved.\n\nBest regards,\nThe FinLedger Team\n\n`);
        logger.log("info", `Registration email sent to ${email} for new user ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo());
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            logger.log("warn", `Failed to send registration email to ${email} for new user ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo());
        }
        await updateSecurityQuestions(newUser.id, [
            { question: security_question_1, answer: security_answer_1 },
            { question: security_question_2, answer: security_answer_2 },
            { question: security_question_3, answer: security_answer_3 },
        ]);
        return res.json({ user: newUser });
    } catch (error) {
        logger.log("error", `Error registering new user: ${error}`, { function: "register_new_user" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to register user" });
    }
});

router.get("/reset-password/:userId", async (req, res) => {
    const userIdToReset = req.params.userId;
    // If userId is an email, look up the user ID
    let userIdNumeric = userIdToReset;
    if (isNaN(userIdToReset)) {
        const userData = await getUserByEmail(userIdToReset);
        if (!userData) {
            return res.status(404).json({ error: "User not found" });
        }
        userIdNumeric = userData.id;
    }
    const userData = await getUserById(userIdNumeric);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    // Send an email with a password reset link
    const resetToken = utilities.generateRandomToken(128);
    const resetLinkUrlBase = process.env.FRONTEND_BASE_URL || "http://localhost:3000";
    const resetLink = `${resetLinkUrlBase}/#/login?userId=${userIdNumeric}&reset_token=${resetToken}`;
    // Store the reset token and its expiration (e.g., 1 hour) in the database
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    await db.query("UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3", [resetToken, tokenExpiry, userIdNumeric]);
    const emailResult = await sendEmail(userData.email, "FinLedger Password Reset Request", `Dear ${userData.first_name},\n\nWe received a request to reset your FinLedger account password. Please use the link below to reset your password. This link will expire in 1 hour.\n\nPassword Reset Link: ${resetLink}\n\nIf you did not request a password reset, please ignore this email.\n\nBest regards,\nThe FinLedger Team\n\n`);
    if (!emailResult.accepted || emailResult.accepted.length === 0) {
        logger.log("warn", `Failed to send password reset email to ${userData.email} for user ID ${userIdNumeric}`, { function: "reset-password" }, utilities.getCallerInfo());
    }
    return res.json({ message: "Password reset email sent successfully" });
});

router.get("/security-questions/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    // Look up user by reset token
    const userData = await getUserByResetToken(resetToken);
    if (!userData) {
        return res.status(404).json({ error: "Invalid or expired reset token" });
    }
    // Get security questions for the user
    const securityQuestions = await getSecurityQuestionsForUser(userData.id);
    return res.json({ security_questions: securityQuestions });
});

router.post("/verify-security-answers/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    const { securityAnswers, newPassword } = req.body;
    // Look up user by reset token
    const userData = await getUserByResetToken(resetToken);
    if (!userData) {
        return res.status(404).json({ error: "Invalid or expired reset token" });
    }
    const verified = await verifySecurityAnswers(userData.id, securityAnswers);
    if (!verified) {
        logger.log("warn", `Security answers verification failed for user ID ${userData.id} during password reset`, { function: "verify-security-answers" }, utilities.getCallerInfo());
        return res.status(403).json({ error: "Security answers verification failed" });
    }
    try {
        await changePassword(userData.id, newPassword);
        // Clear the reset token
        await db.query("UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = $1", [userData.id]);
        return res.json({ message: "Password reset successfully" });
    } catch (error) {
        logger.log("error", `Error resetting password for user ID ${userData.id}: ${error}`, { function: "verify-security-answers" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to reset password" });
    }
});

module.exports = router;
