const { getUserLoggedInStatus } = require("../controllers/users.js");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const db = require("../db/db.js");

const non_auth_paths_begin = ["/api/auth/status", "/api/auth/logout", "/public_images", "/js/utils", "/js/app.js", "/js/background", "/css/", "/pages/public", "/js/pages/public", "/api/users/reset-password", "/api/users/security-questions", "/api/users/security-questions-list", "/api/users/verify-security-answers"];
const non_auth_paths_full = ["/", "/not_found.html", "/not_logged_in.html", "/api/users/register_new_user"];

const setSessionExpiryHeaders = async (res, userId, token) => {
    try {
        const sessionResult = await db.query("SELECT logout_at FROM logged_in_users WHERE user_id = $1 AND token = $2", [userId, token]);
        if (sessionResult.rowCount === 0) {
            return;
        }
        const logoutAt = sessionResult.rows[0]?.logout_at ? new Date(sessionResult.rows[0].logout_at) : null;
        if (!logoutAt || Number.isNaN(logoutAt.getTime())) {
            return;
        }
        const expiresInSeconds = Math.max(0, Math.floor((logoutAt.getTime() - Date.now()) / 1000));
        res.set("X-Session-Expires-At", logoutAt.toISOString());
        res.set("X-Session-Expires-In", String(expiresInSeconds));
    } catch (error) {
        log("warn", "Failed to set session expiry headers", { user_id: userId, error: error.message }, utilities.getCallerInfo(), userId);
    }
};

const authMiddleware = async (req, res, next) => {
    // If req is for a public route, skip authentication
    if (non_auth_paths_begin.some((publicPath) => req.path.startsWith(publicPath)) || non_auth_paths_full.includes(req.path)) {
        log("trace", "Skipping auth for public route", { path: req.path }, utilities.getCallerInfo());
        return next();
    }
    const authHeader = req.get("authorization");
    if (!authHeader) {
        log("warn", "Missing Authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        log("warn", "Invalid Authorization header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Invalid Authorization header" });
    }
    const userId = req.get("X-User-Id");
    if (!userId) {
        log("warn", "Missing X-User-Id header", { path: req.path }, utilities.getCallerInfo());
        return res.status(401).json({ error: "Missing X-User-Id header" });
    }
    req.user = { token: token, id: userId };
    const loggedIn = await getUserLoggedInStatus(userId, token);
    if (!loggedIn) {
        if(req.path.startsWith("/pages/")) {
            log("info", `Unauthenticated access attempt to ${req.path}`, { user_id: userId }, utilities.getCallerInfo(), req.user.id);
            return res.status(401).json({ error: "NOT_LOGGED_IN" });
        }
        log("warn", "Invalid or expired token", { user_id: userId, path: req.path }, utilities.getCallerInfo(), req.user.id);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    const tempPasswordResult = await db.query("SELECT temp_password FROM users WHERE id = $1", [userId]);
    const tempPassword = tempPasswordResult.rowCount > 0 && tempPasswordResult.rows[0].temp_password === true;
    if (tempPassword) {
        const tempAllowedPaths = new Set([
            "/api/users/change-temp-password",
            "/api/auth/logout",
            "/api/auth/status",
            "/pages/force_password_change.html",
            "/js/pages/force_password_change.js",
            "/api/users/security-questions-list",
        ]);
        if (!tempAllowedPaths.has(req.path)) {
            log("warn", "Blocked request due to temporary password requirement", { user_id: userId, path: req.path }, utilities.getCallerInfo(), req.user.id);
            return res.status(403).json({ error: "TEMP_PASSWORD_CHANGE_REQUIRED" });
        }
    }
    await setSessionExpiryHeaders(res, userId, token);
    log("trace", `User ${userId} authenticated successfully`, { user_id: userId }, utilities.getCallerInfo(), req.user.id);
    return next();
};

module.exports = authMiddleware;
