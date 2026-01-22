/**
 * This file provides routes to get info about users (other than the current logged-in user).
 */

const express = require("express");
const router = express.Router();
const { isAdmin, getUserById, listUsers, listLoggedInUsers, approveUser, createUser, rejectUser, changePassword } = require("../controllers/users.js");
const logger = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");

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
    const { newPassword } = req.body;
    try {
        await changePassword(requestingUserId, newPassword);
        return res.json({ message: "Password changed successfully" });
    } catch (error) {
        logger.log("error", `Error changing password for user ID ${requestingUserId}: ${error}`, { function: "changePassword" }, utilities.getCallerInfo());
        return res.status(500).json({ error: "Failed to change password" });
    }   
});

module.exports = router;
