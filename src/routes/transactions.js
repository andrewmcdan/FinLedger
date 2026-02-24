const express = require("express");
const router = express.Router();
const {} = require("../controllers/transactions");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const db = require("../db/db.js");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");
const { getUserLoggedInStatus, isAdmin} = require("../controllers/users.js");

const ensureAuthenticatedUser = (req, res, next) => {
    if (!req.user?.id || !req.user?.token) {
        log("warn", "Unauthorized upload request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if(!getUserLoggedInStatus(req.user.id, req.user.token)) {
        log("warn", "Invalid token for authenticated user", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    return next();
};

const ensureNotAdminUser = (req, res, next) => {
    if (isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform this action", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }
    return next();
}

router.post("/new-journal-entry", ensureNotAdminUser, async (req, res) => {
    // Implementation for creating a new journal entry
    // This is a placeholder and should be replaced with actual logic
    return sendApiSuccess(res, { message: "New journal entry created successfully" });
});

module.exports = router;