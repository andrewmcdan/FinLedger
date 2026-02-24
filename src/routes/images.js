const path = require("path");
const express = require("express");
const router = express.Router();
const { getUserById } = require("../controllers/users");
const logger = require("../utils/logger");
const utilities = require("../utils/utilities");

const pathRoot = path.resolve(__dirname, "./../../user-icons/");
const pathDefault = path.resolve(__dirname, "./../../web/public_images/default.png");

router.get("/user-icon.png", async (req, res) => {
    logger.log("info", `Request for user icon by user ID ${req.user ? req.user.id : "unknown"}`, { function: "user-icon" }, utilities.getCallerInfo(), req.user ? req.user.id : null);
    // Get the user's icon filename based on req.user.id
    if (!req.user || !req.user.id) {
        logger.log("warn", "User icon request without authenticated user", { path: req.path }, utilities.getCallerInfo());
        // No user info, send default icon
        return res.sendFile(path.join(pathDefault));
    }
    const userIconFileName = await getUserById(req.user.id.toString()).then((user) => {
        if (user && user.user_icon_path) {
            return path.basename(user.user_icon_path);
        }
        return pathDefault;
    });
    const userIconPath = path.join(pathRoot, userIconFileName);
    res.sendFile(userIconPath, (err) => {
        if (err) {
            logger.log("error", `Error sending user icon file: ${err.message}`, { path: userIconPath }, utilities.getCallerInfo(), req.user ? req.user.id : null);
            res.sendFile(pathDefault);
        }
    });
});

module.exports = router;
