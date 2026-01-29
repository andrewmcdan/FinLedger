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

const multer = require("multer");
const fs = require("fs");

fs.mkdirSync(pathRoot, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, pathRoot),
    filename: (req, file, cb) => {
        cb(null, `${file.originalname}`);
    },
});

const allowed = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.has(ext)) {
            logger.log("warn", "Rejected user icon upload due to invalid file type", { ext, filename: file.originalname }, utilities.getCallerInfo(), req.user ? req.user.id : null);
            return cb(new Error("Invalid file type"));
        }
        cb(null, true);
    },
});
router.post("/upload-user-icon", upload.single("user_icon"), (req, res) => {
    logger.log("info", `Upload user icon request by user ID ${req.user ? req.user.id : "unknown"}`, { function: "upload-user-icon" }, utilities.getCallerInfo(), req.user ? req.user.id : null);

    if (!req.user?.id) {
        logger.log("warn", "Unauthorized user icon upload request", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!req.file) {
        logger.log("warn", "User icon upload missing file", { userId: req.user.id }, utilities.getCallerInfo(), req.user.id);
        return res.status(400).json({ error: "No file uploaded" });
    }

    return res.json({
        message: "File uploaded successfully",
        file_name: req.file.filename,
    });
});

module.exports = router;
