/**
 * This file provides routes to get info about users (other than the current logged-in user).
 */

const express = require("express");
const router = express.Router();
const { isAdmin, getUserById, listUsers, listLoggedInUsers, approveUser, createUser } = require("../controllers/users.js");

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

router.post("/create-user", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(requestingUserId))) {
        return res.status(403).json({ error: "Access denied. Administrator role required." });
    }
    const { first_name, last_name, email, password, role, address, date_of_birth, profile_image } = req.body;
    console.log(req.body);
    try {
        const newUser = await createUser(first_name, last_name, email, password, role, address, date_of_birth, profile_image);
        return res.json({ user: newUser });
    } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).json({ error: "Failed to create user" });
    }
});

module.exports = router;
