const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const uploadNone = multer();
const userIconRoot = path.resolve(__dirname, "./../../user-icons/");
const allowedImageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

fs.mkdirSync(userIconRoot, { recursive: true });

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, userIconRoot),
    filename: (req, file, cb) => {
        cb(null, path.basename(file.originalname));
    },
});

const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedImageExts.has(ext)) {
            return cb(new Error("Invalid file type"));
        }
        return cb(null, true);
    },
});
const router = express.Router();
const { getUserLoggedInStatus, setUserPassword, isAdmin, getUserById, listUsers, listLoggedInUsers, approveUser, createUser, rejectUser, suspendUser, reinstateUser, changePassword, changePasswordWithCurrentPassword, updateSecurityQuestionsWithCurrentPassword, updateUserProfile, getUserByEmail, updateSecurityQuestions, getSecurityQuestionsForUser, verifySecurityAnswers, getUserByResetToken, deleteUserById } = require("../controllers/users.js");
const { SECURITY_QUESTIONS } = require("../data/security_questions");
const logger = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendEmail } = require("../services/email.js");
const db = require("../db/db.js");

router.get("/security-questions-list", async (req, res) => {
    return res.json({ security_questions: SECURITY_QUESTIONS });
});

router.get("/get-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
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
    if (!(await isAdmin(requestingUserId, req.user.token))) {
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
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const loggedInUsers = await listLoggedInUsers();
    return res.json({ logged_in_users: loggedInUsers });
});

router.post("/email-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { username, subject, message } = req.body || {};
    if (!username || !subject || !message) {
        return res.status(400).json({ error: "Username, subject, and message are required" });
    }
    try {
        const userResult = await db.query("SELECT email, first_name FROM users WHERE username = $1", [username]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        const user = userResult.rows[0];
        const emailBody = `Dear ${user.first_name || username},\n\n${message}\n\nBest regards,\nFinLedger Team`;
        const emailResult = await sendEmail(user.email, subject, emailBody);
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            logger.log("warn", `Failed to send email to ${user.email} for username ${username}`, { function: "email-user" }, utilities.getCallerInfo());
        }
        return res.json({ message: "Email sent successfully" });
    } catch (error) {
        logger.log("error", `Error sending email to username ${username}: ${error}`, { function: "email-user" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to send email" });
    }
});

router.get("/approve-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
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
    const loginLinkUrlBase = process.env.FRONTEND_BASE_URL || "http://localhost:3050";
    const loginLink = `${loginLinkUrlBase}/#/login`;
    const emailResult = await sendEmail(userData.email, "Your FinLedger Account Has Been Approved", `Dear ${userData.first_name},\n\nWe are pleased to inform you that your FinLedger account has been approved by an administrator. You can now log in with your username and start using our services.\n\nUsername: ${userData.username}\n\nLogin here: ${loginLink}\n\nBest regards,\nThe FinLedger Team\n\n`);
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
    if (!(await isAdmin(requestingUserId, req.user.token))) {
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

router.post("/create-user", uploadProfile.single("user_icon"), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    logger.log("info", `User ID ${requestingUserId} is attempting to create a new user`, { function: "create-user" }, utilities.getCallerInfo());
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        logger.log("warn", `Access denied for user ID ${requestingUserId} to create a new user. Administrator role required.`, { function: "create-user" }, utilities.getCallerInfo());
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { first_name, last_name, email, password, role, address, date_of_birth } = req.body;
    try {
        const user_icon_name = req.file ? req.file.path : null;
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, user_icon_name);
        logger.log("info", `New user created with ID ${newUser.id} by admin user ID ${requestingUserId}`, { function: "create-user" }, utilities.getCallerInfo());
        return res.json({ user: newUser });
    } catch (error) {
        logger.log("error", `Error creating user by admin user ID ${requestingUserId}: ${error}`, { function: "create-user" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to create user" });
    }
});

// TODO: Remove maybe?
// router.post("/changePassword", async (req, res) => {
//     const requestingUserId = req.user.id;
//     if (!requestingUserId) {
//         return res.status(401).json({ error: "Unauthorized" });
//     }
//     const { newPassword, securityAnswers } = req.body;
//     const verified = await verifySecurityAnswers(requestingUserId, securityAnswers);
//     if (!verified) {
//         logger.log("warn", `Security answers verification failed for user ID ${requestingUserId} during password change`, { function: "changePassword" }, utilities.getCallerInfo());
//         return res.status(403).json({ error: "Security answers verification failed" });
//     }
//     try {
//         await changePassword(requestingUserId, newPassword);
//         return res.json({ message: "Password changed successfully" });
//     } catch (error) {
//         logger.log("error", `Error changing password for user ID ${requestingUserId}: ${error}`, { function: "changePassword" }, utilities.getCallerInfo());
//         return res.status(500).json({ error: "Failed to change password" });
//     }
// });

router.post("/change-password", uploadNone.none(), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const currentPassword = req.body.current_password || req.body.currentPassword;
    const newPassword = req.body.new_password || req.body.newPassword;
    const confirmPassword = req.body.confirm_new_password || req.body.confirmPassword;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
    }
    if (confirmPassword && newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
    }
    try {
        await changePasswordWithCurrentPassword(requestingUserId, currentPassword, newPassword);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        if (error?.code === "INVALID_CURRENT_PASSWORD" || error?.message === "Current password is incorrect") {
            return res.status(403).json({ error: "Current password is incorrect" });
        }
        const userErrorMessages = new Set([
            "Password does not meet complexity requirements",
            "New password cannot be the same as any past passwords",
        ]);
        const errorMessage = userErrorMessages.has(error?.message) ? error.message : "Failed to change password";
        const statusCode = errorMessage === "Failed to change password" ? 500 : 400;
        return res.status(statusCode).json({ error: errorMessage });
    }
});

router.post("/update-security-questions", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const currentPassword = req.body.current_password || req.body.currentPassword;
    if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
    }
    const securityQuestions = [
        {
            question: req.body.security_question_1,
            answer: req.body.security_answer_1,
        },
        {
            question: req.body.security_question_2,
            answer: req.body.security_answer_2,
        },
        {
            question: req.body.security_question_3,
            answer: req.body.security_answer_3,
        },
    ];
    const missingEntry = securityQuestions.find((entry) => !entry.question || !entry.answer);
    if (missingEntry) {
        return res.status(400).json({ error: "All security questions and answers are required" });
    }
    try {
        await updateSecurityQuestionsWithCurrentPassword(requestingUserId, currentPassword, securityQuestions);
        return res.json({ message: "Security questions updated successfully" });
    } catch (error) {
        if (error?.code === "INVALID_CURRENT_PASSWORD" || error?.message === "Current password is incorrect") {
            return res.status(403).json({ error: "Current password is incorrect" });
        }
        return res.status(500).json({ error: "Failed to update security questions" });
    }
});

router.post("/update-profile", uploadProfile.single("profile_image"), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const userData = await getUserById(requestingUserId);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    const profileUpdates = {
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email: req.body.email,
        address: req.body.address,
    };
    if (req.file?.path) {
        const targetFileName = path.basename(userData.user_icon_path || "");
        if (!targetFileName) {
            return res.status(400).json({ error: "User profile image path is not set" });
        }
        const targetPath = path.join(userIconRoot, targetFileName);
        try {
            if (fs.existsSync(targetPath) && targetPath !== req.file.path) {
                fs.unlinkSync(targetPath);
            }
            if (targetPath !== req.file.path) {
                fs.renameSync(req.file.path, targetPath);
            }
        } catch (error) {
            logger.log("error", `Error updating profile image for user ID ${requestingUserId}: ${error}`, { function: "update-profile" }, utilities.getCallerInfo());
            return res.status(500).json({ error: "Failed to update profile image" });
        }
    }
    try {
        const updatedUser = await updateUserProfile(requestingUserId, profileUpdates);
        return res.json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
        logger.log("error", `Error updating profile for user ID ${requestingUserId}: ${error}`, { function: "update-profile" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to update profile" });
    }
});

router.post("/change-temp-password", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const { newPassword, securityQuestions } = req.body;
    if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
    }
    if (!Array.isArray(securityQuestions) || securityQuestions.length !== 3) {
        return res.status(400).json({ error: "Exactly three security questions and answers are required" });
    }
    for (const entry of securityQuestions) {
        if (!entry || !entry.question || !entry.answer) {
            return res.status(400).json({ error: "All security questions and answers are required" });
        }
    }
    const tempResult = await db.query("SELECT temp_password FROM users WHERE id = $1", [requestingUserId]);
    if (tempResult.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
    }
    if (!tempResult.rows[0].temp_password) {
        return res.status(400).json({ error: "Temporary password not required" });
    }
    try {
        await updateSecurityQuestions(requestingUserId, securityQuestions);
        await changePassword(requestingUserId, newPassword);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        logger.log("error", `Error changing temp password for user ID ${requestingUserId}: ${error}`, { function: "change-temp-password" }, utilities.getCallerInfo());
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
    const resetLinkUrlBase = process.env.FRONTEND_BASE_URL || "http://localhost:3050";
    const resetLink = `${resetLinkUrlBase}/#/login?userId=${userIdNumeric}&reset_token=${resetToken}`;
    // Store the reset token and its expiration (e.g., 1 hour) in the database
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    await db.query("UPDATE users SET reset_token = $1, reset_token_expires_at = $2, updated_at = now() WHERE id = $3", [resetToken, tokenExpiry, userIdNumeric]);
    const emailResult = await sendEmail(userData.email, "FinLedger Password Reset Request", `Dear ${userData.first_name},\n\nWe received a request to reset your FinLedger account password. Please use the link below to reset your password. This link will expire in 1 hour.\n\nPassword Reset Link: ${resetLink}\n\nIf you did not request a password reset, please ignore this email.\n\nBest regards,\nThe FinLedger Team\n\n`);
    if (!emailResult.accepted || emailResult.accepted.length === 0) {
        logger.log("warn", `Failed to send password reset email to ${userData.email} for user ID ${userIdNumeric}`, { function: "reset-password" }, utilities.getCallerInfo());
    }
    return res.json({ message: "Password reset email sent successfully" });
});

router.get("/security-questions/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    const userData = await getUserByResetToken(resetToken);
    if (!userData) {
        return res.status(404).json({ error: "Invalid or expired reset token" });
    }
    const securityQuestions = await getSecurityQuestionsForUser(userData.id);
    return res.json({ security_questions: securityQuestions });
});

router.post("/verify-security-answers/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    const { securityAnswers, newPassword } = req.body;
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
        await db.query("UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL, updated_at = now() WHERE id = $1", [userData.id]);
        return res.json({ message: "Password reset successfully" });
    } catch (error) {
        logger.log("error", `Error resetting password for user ID ${userData.id}: ${error}`, { function: "verify-security-answers" }, utilities.getCallerInfo());
        const userErrorMessages = new Set([
            "Password does not meet complexity requirements",
            "New password cannot be the same as any past passwords",
        ]);
        const errorMessage = userErrorMessages.has(error?.message) ? error.message : "Failed to reset password";
        const statusCode = errorMessage === "Failed to reset password" ? 500 : 400;
        return res.status(statusCode).json({ error: errorMessage });
    }
});

router.post("/suspend-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { userIdToSuspend, suspensionStart, suspensionEnd } = req.body;
    const userData = await getUserById(userIdToSuspend);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "active") {
        return res.status(400).json({ error: "Only active users can be suspended" });
    }
    await suspendUser(userIdToSuspend, suspensionStart, suspensionEnd);;
    logger.log("info", `User ID ${userIdToSuspend} suspended by admin user ID ${requestingUserId}`, { function: "suspend-user" }, utilities.getCallerInfo());
    return res.json({ message: "User suspended successfully" });
});

router.get("/reinstate-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReinstate = req.params.userId;
    const userData = await getUserById(userIdToReinstate);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "suspended") {
        return res.status(400).json({ error: "Only suspended users can be reinstated" });
    }
    await reinstateUser(userIdToReinstate);
    logger.log("info", `User ID ${userIdToReinstate} reinstated by admin user ID ${requestingUserId}`, { function: "reinstate-user" }, utilities.getCallerInfo());
    return res.json({ message: "User reinstated successfully" });
});

router.post("/update-user-field", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { user_id, field, value } = req.body;
    const userId = user_id;
    const fieldName = field;
    const newValue = value;
    const userData = await getUserById(userId);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    const allowedFields = new Set(["fullname", "first_name", "last_name", "email", "role", "status", "address", "date_of_birth", "last_login_at", "password_expires_at", "suspension_start_at", "suspension_end_at", "temp_password"]);
    if (!allowedFields.has(fieldName)) {
        return res.status(400).json({ error: "Field cannot be updated" });
    }
    if(fieldName ==="fullname") {
        const nameParts = newValue.trim().split(" ");
        const firstName = nameParts.shift();
        const lastName = nameParts.join(" ");
        await updateUserProfile(userId, { first_name: firstName, last_name: lastName });
    } else {
        const updateData = {};
        updateData[fieldName] = newValue;
        await updateUserProfile(userId, updateData);
    }
    logger.log("info", `User ID ${userId} field ${fieldName} updated by admin user ID ${requestingUserId}`, { function: "update-user-field" }, utilities.getCallerInfo());
    return res.json({ message: "User field updated successfully" });
});

router.post("/delete-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { userIdToDelete } = req.body;
    const userData = await getUserById(userIdToDelete);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    await deleteUserById(userIdToDelete);
    logger.log("info", `User ID ${userIdToDelete} deleted by admin user ID ${requestingUserId}`, { function: "delete-user" }, utilities.getCallerInfo());
    return res.json({ message: "User deleted successfully" });
});

router.get("/reset-user-password/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReset = req.params.userId;
    const userData = await getUserById(userIdToReset);
    if (!userData) {
        return res.status(404).json({ error: "User not found" });
    }
    try{
        const tempPassword = utilities.generateRandomToken(12) + "aA1!";
        await setUserPassword(userIdToReset, tempPassword, true);
        const emailResult = await sendEmail(userData.email, "FinLedger Password Reset by Administrator", `Dear ${userData.first_name},\n\nAn administrator has reset your FinLedger account password. Please use the temporary password below to log in and change your password immediately.\n\nTemporary Password: ${tempPassword}\n\nBest regards,\nThe FinLedger Team\n\n`);
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            logger.log("warn", `Failed to send admin password reset email to ${userData.email} for user ID ${userIdToReset}`, { function: "reset-user-password" }, utilities.getCallerInfo());
        }
        return res.json({ message: "User password reset successfully" });
    }
    catch (error) {
        logger.log("error", `Error resetting password for user ID ${userIdToReset} by admin ID ${requestingUserId}: ${error}`, { function: "reset-user-password" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to reset user password" });
    }
});

module.exports = router;
