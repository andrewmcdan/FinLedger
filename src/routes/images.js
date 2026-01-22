const path = require("path");
const express = require("express");
const router = express.Router();
const { getUserById } = require("../controllers/users");
const logger = require("../utils/logger");
const utilities = require("../utils/utilities");

const pathRoot = path.resolve(__dirname, "./../../user-icons/");

router.get("/user-icon.png", async (req, res) => {
    logger.log("info", `Request for user icon by user ID ${req.user ? req.user.id : "unknown"}`, { function: "user-icon" }, utilities.getCallerInfo());
    // Get the user's icon filename based on req.user.id
    if (!req.user || !req.user.id) {
        // No user info, send default icon
        return res.sendFile(path.join(pathRoot, "default.png"));
    }
    const userIconFileName = await getUserById(req.user.id.toString()).then((user) => {
        if (user && user.profile_image_url) {
            return path.basename(user.profile_image_url);
        }
        return "default.png";
    });
    const userIconPath = path.join(pathRoot, userIconFileName);
    res.sendFile(userIconPath, (err) => {
        if (err) {
            console.error("Error sending user icon file:", err);
            res.sendFile(path.join(pathRoot, "default.png"));
        }
    });
});

module.exports = router;
