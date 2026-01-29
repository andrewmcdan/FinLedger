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
const {
    getUserLoggedInStatus,
    getUserByUsername,
    setUserPassword,
    isAdmin,
    getUserById,
    listUsers,
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
    deleteUserById,
} = require("../controllers/users.js");
const { SECURITY_QUESTIONS } = require("../data/security_questions");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendEmail } = require("../services/email.js");
const db = require("../db/db.js");

router.get("/security-questions-list", async (req, res) => {
    log("debug", "Security questions list requested", { userId: req.user?.id }, utilities.getCallerInfo(), req.user?.id);
    return res.json({ security_questions: SECURITY_QUESTIONS });
});

router.get("/get-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized get-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden get-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToGet = req.params.userId;
    log("debug", "Fetching user via API", { requestingUserId, userIdToGet }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userIdToGet);
    if (!userData) {
        log("warn", "User not found via API", { requestingUserId, userIdToGet }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: userData });
});

router.get("/list-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized list-users request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden list-users request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    log("debug", "Listing users via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const users = await listUsers();
    return res.json({ users });
});

router.get("/get-logged-in-users", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized get-logged-in-users request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden get-logged-in-users request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    log("debug", "Listing logged-in users via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const loggedInUsers = await listLoggedInUsers();
    return res.json({ logged_in_users: loggedInUsers });
});

router.post("/email-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized email-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden email-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { username, subject, message } = req.body || {};
    if (!username || !subject || !message) {
        log("warn", "Email-user request missing fields", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Username, subject, and message are required" });
    }
    try {
        log("info", "Sending user email via API", { requestingUserId, username }, utilities.getCallerInfo(), requestingUserId);
        const userResult = await db.query("SELECT email, first_name FROM users WHERE username = $1", [username]);
        if (userResult.rowCount === 0) {
            log("warn", "Email-user target not found", { requestingUserId, username }, utilities.getCallerInfo(), requestingUserId);
            return res.status(404).json({ error: "User not found" });
        }
        const user = userResult.rows[0];
        const emailBody = `Dear ${user.first_name || username},\n\n${message}\n\nBest regards,\nFinLedger Team`;
        const emailResult = await sendEmail(user.email, subject, emailBody);
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            log("warn", `Failed to send email to ${user.email} for username ${username}`, { function: "email-user" }, utilities.getCallerInfo(), requestingUserId);
        }
        return res.json({ message: "Email sent successfully" });
    } catch (error) {
        log("error", `Error sending email to username ${username}: ${error}`, { function: "email-user" }, utilities.getCallerInfo(), requestingUserId);
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
    log("info", `User ID ${userIdToApprove} approved by admin user ID ${requestingUserId}`, { function: "approve-user" }, utilities.getCallerInfo(), requestingUserId);
    const loginLinkUrlBase = process.env.FRONTEND_BASE_URL || "http://localhost:3050";
    const loginLink = `${loginLinkUrlBase}/#/login`;
    const emailResult = await sendEmail(
        userData.email,
        "Your FinLedger Account Has Been Approved",
        `Dear ${userData.first_name},\n\nWe are pleased to inform you that your FinLedger account has been approved by an administrator. You can now log in with your username and start using our services.\n\nUsername: ${userData.username}\n\nLogin here: ${loginLink}\n\nBest regards,\nThe FinLedger Team\n\n`,
    );
    if (!emailResult.accepted || emailResult.accepted.length === 0) {
        log("warn", `Failed to send approval email to ${userData.email} for user ID ${userIdToApprove}`, { function: "approve-user" }, utilities.getCallerInfo(), requestingUserId);
    }
    return res.json({ message: "User approved successfully" });
});

router.get("/reject-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized reject-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden reject-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReject = req.params.userId;
    const userData = await getUserById(userIdToReject);
    if (!userData) {
        log("warn", "Reject-user target not found", { requestingUserId, userIdToReject }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "pending") {
        log("warn", "Reject-user attempted for non-pending user", { requestingUserId, userIdToReject, status: userData.status }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "User is not pending approval" });
    }
    rejectUser(userIdToReject);
    log("info", `User ID ${userIdToReject} rejected by admin user ID ${requestingUserId}`, { function: "reject-user" }, utilities.getCallerInfo(), requestingUserId);
    return res.json({ message: "User rejected successfully" });
});

router.post("/create-user", uploadProfile.single("user_icon"), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    log("info", `User ID ${requestingUserId} is attempting to create a new user`, { function: "create-user" }, utilities.getCallerInfo(), requestingUserId);
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", `Access denied for user ID ${requestingUserId} to create a new user. Administrator role required.`, { function: "create-user" }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { first_name, last_name, email, password, role, address, date_of_birth } = req.body;
    try {
        const user_icon_name = req.file ? req.file.path : null;
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, user_icon_name);
        log("info", `New user created with ID ${newUser.id} by admin user ID ${requestingUserId}`, { function: "create-user" }, utilities.getCallerInfo(), requestingUserId);
        return res.json({ user: newUser });
    } catch (error) {
        log("error", `Error creating user by admin user ID ${requestingUserId}: ${error}`, { function: "create-user" }, utilities.getCallerInfo(), requestingUserId);
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
//         log("warn", `Security answers verification failed for user ID ${requestingUserId} during password change`, { function: "changePassword" }, utilities.getCallerInfo());
//         return res.status(403).json({ error: "Security answers verification failed" });
//     }
//     try {
//         await changePassword(requestingUserId, newPassword);
//         return res.json({ message: "Password changed successfully" });
//     } catch (error) {
//         log("error", `Error changing password for user ID ${requestingUserId}: ${error}`, { function: "changePassword" }, utilities.getCallerInfo());
//         return res.status(500).json({ error: "Failed to change password" });
//     }
// });

router.post("/change-password", uploadNone.none(), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized change-password request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    log("info", "Change password request received", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const currentPassword = req.body.current_password || req.body.currentPassword;
    const newPassword = req.body.new_password || req.body.newPassword;
    const confirmPassword = req.body.confirm_new_password || req.body.confirmPassword;
    if (!currentPassword || !newPassword) {
        log("warn", "Change password request missing required fields", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Current password and new password are required" });
    }
    if (confirmPassword && newPassword !== confirmPassword) {
        log("warn", "Change password request password mismatch", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Passwords do not match" });
    }
    try {
        await changePasswordWithCurrentPassword(requestingUserId, currentPassword, newPassword);
        log("info", "Password changed via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        if (error?.code === "INVALID_CURRENT_PASSWORD" || error?.message === "Current password is incorrect") {
            log("warn", "Change password failed due to invalid current password", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
            return res.status(403).json({ error: "Current password is incorrect" });
        }
        const userErrorMessages = new Set(["Password does not meet complexity requirements", "New password cannot be the same as any past passwords"]);
        const errorMessage = userErrorMessages.has(error?.message) ? error.message : "Failed to change password";
        const statusCode = errorMessage === "Failed to change password" ? 500 : 400;
        log("error", `Change password failed: ${errorMessage}`, { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(statusCode).json({ error: errorMessage });
    }
});

router.post("/update-security-questions", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized update-security-questions request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    log("info", "Update security questions request received", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const currentPassword = req.body.current_password || req.body.currentPassword;
    if (!currentPassword) {
        log("warn", "Update security questions missing current password", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
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
        log("warn", "Update security questions missing entries", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "All security questions and answers are required" });
    }
    try {
        await updateSecurityQuestionsWithCurrentPassword(requestingUserId, currentPassword, securityQuestions);
        log("info", "Security questions updated via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.json({ message: "Security questions updated successfully" });
    } catch (error) {
        if (error?.code === "INVALID_CURRENT_PASSWORD" || error?.message === "Current password is incorrect") {
            log("warn", "Update security questions failed due to invalid current password", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
            return res.status(403).json({ error: "Current password is incorrect" });
        }
        log("error", `Update security questions failed: ${error.message}`, { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(500).json({ error: "Failed to update security questions" });
    }
});

router.post("/update-profile", uploadProfile.single("profile_image"), async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized update-profile request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    log("info", "Update profile request received", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(requestingUserId);
    if (!userData) {
        log("warn", "Update profile user not found", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
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
            log("error", `Error updating profile image for user ID ${requestingUserId}: ${error}`, { function: "update-profile" }, utilities.getCallerInfo(), requestingUserId);
            return res.status(500).json({ error: "Failed to update profile image" });
        }
    }
    try {
        const updatedUser = await updateUserProfile(requestingUserId, profileUpdates);
        log("info", "Profile updated via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
        log("error", `Error updating profile for user ID ${requestingUserId}: ${error}`, { function: "update-profile" }, utilities.getCallerInfo(), requestingUserId);
        return res.status(500).json({ error: "Failed to update profile" });
    }
});

router.post("/change-temp-password", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized change-temp-password request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    log("info", "Change temp password request received", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
    const { newPassword, securityQuestions } = req.body;
    if (!newPassword) {
        log("warn", "Change temp password missing new password", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "New password is required" });
    }
    if (!Array.isArray(securityQuestions) || securityQuestions.length !== 3) {
        log("warn", "Change temp password invalid security question payload", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Exactly three security questions and answers are required" });
    }
    for (const entry of securityQuestions) {
        if (!entry || !entry.question || !entry.answer) {
            return res.status(400).json({ error: "All security questions and answers are required" });
        }
    }
    const tempResult = await db.query("SELECT temp_password FROM users WHERE id = $1", [requestingUserId]);
    if (tempResult.rowCount === 0) {
        log("warn", "Change temp password user not found", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    if (!tempResult.rows[0].temp_password) {
        log("warn", "Change temp password not required", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Temporary password not required" });
    }
    try {
        await updateSecurityQuestions(requestingUserId, securityQuestions);
        await changePassword(requestingUserId, newPassword);
        log("info", "Temp password changed via API", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        log("error", `Error changing temp password for user ID ${requestingUserId}: ${error}`, { function: "change-temp-password" }, utilities.getCallerInfo(), requestingUserId);
        return res.status(500).json({ error: "Failed to change password" });
    }
});

router.post("/register_new_user", async (req, res) => {
    const { first_name, last_name, email, password, address, date_of_birth, role, security_question_1, security_answer_1, security_question_2, security_answer_2, security_question_3, security_answer_3 } = req.body;
    try {
        log("info", "Register new user request received", { email, role }, utilities.getCallerInfo());
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, null);
        log("info", `New user registered with ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo(), newUser.id);
        const emailResult = await sendEmail(email, "Welcome to FinLedger - Registration Successful", `Dear ${first_name},\n\nThank you for registering with FinLedger. Your account is currently pending approval by an administrator. You will receive another email once your account has been approved.\n\nBest regards,\nThe FinLedger Team\n\n`);
        log("info", `Registration email sent to ${email} for new user ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo(), newUser.id);
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            log("warn", `Failed to send registration email to ${email} for new user ID ${newUser.id}`, { function: "register_new_user" }, utilities.getCallerInfo(), newUser.id);
        }
        await updateSecurityQuestions(newUser.id, [
            { question: security_question_1, answer: security_answer_1 },
            { question: security_question_2, answer: security_answer_2 },
            { question: security_question_3, answer: security_answer_3 },
        ]);
        return res.json({ user: newUser });
    } catch (error) {
        log("error", `Error registering new user: ${error}`, { function: "register_new_user" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to register user" });
    }
});

router.get("/reset-password/:email/:userName", async (req, res) => {
    const userNameToReset = req.params.userName;
    const emailToReset = req.params.email;
    log("info", "Password reset request received", { userNameToReset, emailToReset }, utilities.getCallerInfo());
    // If userId is an email, look up the user ID
    const userData1 = await getUserByEmail(emailToReset);
    if (!userData1) {
        log("warn", "Password reset user not found by email", { emailToReset }, utilities.getCallerInfo());
        return res.status(404).json({ error: "User not found" });
    }
    const userData2 = await getUserByUsername(userNameToReset);
    if (!userData2) {
        log("warn", "Password reset user not found by username", { userNameToReset }, utilities.getCallerInfo());
        return res.status(404).json({ error: "User not found" });
    }
    if (userData2.email.toLowerCase() !== emailToReset.toLowerCase()) {
        log("warn", "Password reset email mismatch", { userNameToReset, emailToReset }, utilities.getCallerInfo());
        return res.status(400).json({ error: "Email does not match user ID" });
    }
    // Send an email with a password reset link
    const resetToken = utilities.generateRandomToken(128);
    const resetLinkUrlBase = process.env.FRONTEND_BASE_URL || "http://localhost:3050";
    const resetLink = `${resetLinkUrlBase}/#/login?userId=${userData2.id}&reset_token=${resetToken}`;
    // Store the reset token and its expiration (e.g., 1 hour) in the database
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    await db.query("UPDATE users SET reset_token = $1, reset_token_expires_at = $2, updated_at = now() WHERE id = $3", [resetToken, tokenExpiry, userData2.id]);
    const emailResult = await sendEmail(
        userData2.email,
        "FinLedger Password Reset Request",
        `Dear ${userData2.first_name},\n\nWe received a request to reset your FinLedger account password. Please use the link below to reset your password. This link will expire in 1 hour.\n\nPassword Reset Link: ${resetLink}\n\nIf you did not request a password reset, please ignore this email.\n\nBest regards,\nThe FinLedger Team\n\n`,
    );
    if (!emailResult.accepted || emailResult.accepted.length === 0) {
        log("warn", `Failed to send password reset email to ${userData2.email} for user ID ${userData2.id}`, { function: "reset-password" }, utilities.getCallerInfo(), userData2.id);
    }
    log("info", "Password reset email sent", { userId: userData2.id }, utilities.getCallerInfo(), userData2.id);
    return res.json({ message: "Password reset email sent successfully" });
});

router.get("/security-questions/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    log("debug", "Security questions requested for reset token", {}, utilities.getCallerInfo());
    const userData = await getUserByResetToken(resetToken);
    if (!userData) {
        log("warn", "Security questions request invalid reset token", {}, utilities.getCallerInfo());
        return res.status(404).json({ error: "Invalid or expired reset token" });
    }
    const securityQuestions = await getSecurityQuestionsForUser(userData.id);
    return res.json({ security_questions: securityQuestions });
});

router.post("/verify-security-answers/:resetToken", async (req, res) => {
    const resetToken = req.params.resetToken;
    const { securityAnswers, newPassword } = req.body;
    log("info", "Verify security answers request received", {}, utilities.getCallerInfo());
    const userData = await getUserByResetToken(resetToken);
    if (!userData) {
        log("warn", "Verify security answers invalid reset token", {}, utilities.getCallerInfo());
        return res.status(404).json({ error: "Invalid or expired reset token" });
    }
    const verified = await verifySecurityAnswers(userData.id, securityAnswers);
    if (!verified) {
        log("warn", `Security answers verification failed for user ID ${userData.id} during password reset`, { function: "verify-security-answers" }, utilities.getCallerInfo(), userData.id);
        return res.status(403).json({ error: "Security answers verification failed" });
    }
    try {
        await changePassword(userData.id, newPassword);
        await db.query("UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL, updated_at = now() WHERE id = $1", [userData.id]);
        log("info", "Password reset successful via security answers", { userId: userData.id }, utilities.getCallerInfo(), userData.id);
        return res.json({ message: "Password reset successfully" });
    } catch (error) {
        log("error", `Error resetting password for user ID ${userData.id}: ${error}`, { function: "verify-security-answers" }, utilities.getCallerInfo(), userData.id);
        const userErrorMessages = new Set(["Password does not meet complexity requirements", "New password cannot be the same as any past passwords"]);
        const errorMessage = userErrorMessages.has(error?.message) ? error.message : "Failed to reset password";
        const statusCode = errorMessage === "Failed to reset password" ? 500 : 400;
        return res.status(statusCode).json({ error: errorMessage });
    }
});

router.post("/suspend-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized suspend-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden suspend-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { userIdToSuspend, suspensionStart, suspensionEnd } = req.body;
    log("info", "Suspend user request received", { requestingUserId, userIdToSuspend }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userIdToSuspend);
    if (!userData) {
        log("warn", "Suspend user target not found", { requestingUserId, userIdToSuspend }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "active") {
        log("warn", "Suspend user attempted for non-active user", { requestingUserId, userIdToSuspend, status: userData.status }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Only active users can be suspended" });
    }
    await suspendUser(userIdToSuspend, suspensionStart, suspensionEnd);
    log("info", `User ID ${userIdToSuspend} suspended by admin user ID ${requestingUserId}`, { function: "suspend-user" }, utilities.getCallerInfo(), requestingUserId);
    return res.json({ message: "User suspended successfully" });
});

router.get("/reinstate-user/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized reinstate-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden reinstate-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReinstate = req.params.userId;
    log("info", "Reinstate user request received", { requestingUserId, userIdToReinstate }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userIdToReinstate);
    if (!userData) {
        log("warn", "Reinstate user target not found", { requestingUserId, userIdToReinstate }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    if (userData.status !== "suspended") {
        log("warn", "Reinstate user attempted for non-suspended user", { requestingUserId, userIdToReinstate, status: userData.status }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Only suspended users can be reinstated" });
    }
    await reinstateUser(userIdToReinstate);
    log("info", `User ID ${userIdToReinstate} reinstated by admin user ID ${requestingUserId}`, { function: "reinstate-user" }, utilities.getCallerInfo(), requestingUserId);
    return res.json({ message: "User reinstated successfully" });
});

router.post("/update-user-field", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized update-user-field request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden update-user-field request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { user_id, field, value } = req.body;
    const userId = user_id;
    const fieldName = field;
    const newValue = value;
    log("info", "Update user field request received", { requestingUserId, userId, fieldName }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userId);
    if (!userData) {
        log("warn", "Update user field target not found", { requestingUserId, userId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    const allowedFields = new Set(["fullname", "first_name", "last_name", "email", "role", "status", "address", "date_of_birth", "last_login_at", "password_expires_at", "suspension_start_at", "suspension_end_at", "temp_password"]);
    if (!allowedFields.has(fieldName)) {
        log("warn", "Update user field rejected due to disallowed field", { requestingUserId, userId, fieldName }, utilities.getCallerInfo(), requestingUserId);
        return res.status(400).json({ error: "Field cannot be updated" });
    }
    if (fieldName === "fullname") {
        const nameParts = newValue.trim().split(" ");
        const firstName = nameParts.shift();
        const lastName = nameParts.join(" ");
        await updateUserProfile(userId, { first_name: firstName, last_name: lastName });
    } else {
        const updateData = {};
        updateData[fieldName] = newValue;
        await updateUserProfile(userId, updateData);
    }
    log("info", `User ID ${userId} field ${fieldName} updated by admin user ID ${requestingUserId}`, { function: "update-user-field" }, utilities.getCallerInfo(), requestingUserId);
    return res.json({ message: "User field updated successfully" });
});

router.post("/delete-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized delete-user request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden delete-user request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { userIdToDelete } = req.body;
    log("info", "Delete user request received", { requestingUserId, userIdToDelete }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userIdToDelete);
    if (!userData) {
        log("warn", "Delete user target not found", { requestingUserId, userIdToDelete }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    await deleteUserById(userIdToDelete);
    log("info", `User ID ${userIdToDelete} deleted by admin user ID ${requestingUserId}`, { function: "delete-user" }, utilities.getCallerInfo(), requestingUserId);
    return res.json({ message: "User deleted successfully" });
});

router.get("/reset-user-password/:userId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        log("warn", "Unauthorized reset-user-password request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId, req.user.token))) {
        log("warn", "Forbidden reset-user-password request", { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const userIdToReset = req.params.userId;
    log("info", "Reset user password request received", { requestingUserId, userIdToReset }, utilities.getCallerInfo(), requestingUserId);
    const userData = await getUserById(userIdToReset);
    if (!userData) {
        log("warn", "Reset user password target not found", { requestingUserId, userIdToReset }, utilities.getCallerInfo(), requestingUserId);
        return res.status(404).json({ error: "User not found" });
    }
    try {
        const tempPassword = utilities.generateRandomToken(12) + "aA1!";
        await setUserPassword(userIdToReset, tempPassword, true);
        const emailResult = await sendEmail(userData.email, "FinLedger Password Reset by Administrator", `Dear ${userData.first_name},\n\nAn administrator has reset your FinLedger account password. Please use the temporary password below to log in and change your password immediately.\n\nTemporary Password: ${tempPassword}\n\nBest regards,\nThe FinLedger Team\n\n`);
        if (!emailResult.accepted || emailResult.accepted.length === 0) {
            log("warn", `Failed to send admin password reset email to ${userData.email} for user ID ${userIdToReset}`, { function: "reset-user-password" }, utilities.getCallerInfo(), userIdToReset);
        }
        return res.json({ message: "User password reset successfully" });
    } catch (error) {
        log("error", `Error resetting password for user ID ${userIdToReset} by admin ID ${requestingUserId}: ${error}`, { function: "reset-user-password" }, utilities.getCallerInfo(), requestingUserId);
        return res.status(500).json({ error: "Failed to reset user password" });
    }
});

module.exports = router;
