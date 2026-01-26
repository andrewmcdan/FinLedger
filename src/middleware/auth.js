const { getUserLoggedInStatus } = require("../controllers/users.js");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const db = require("../db/db.js");

const non_auth_paths_begin = ["/api/auth/status", "/api/auth/logout", "/public_images", "/js/utils", "/js/app.js", "/js/background", "/css/", "/pages/public", "/js/pages/public", "/api/users/reset-password", "/api/users/security-questions", "/api/users/security-questions-list", "/api/users/verify-security-answers"];
const non_auth_paths_full = ["/", "/not_found.html", "/not_logged_in.html", "/api/users/register_new_user"];

const authMiddleware = async (req, res, next) => {
    // If req is for a public route, skip authentication
    if (non_auth_paths_begin.some((publicPath) => req.path.startsWith(publicPath)) || non_auth_paths_full.includes(req.path)) {
        return next();
    }
    const authHeader = req.get("authorization");
    if (!authHeader) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid Authorization header" });
    }
    const user_id = req.get("User_id");
    if (!user_id) {
        return res.status(401).json({ error: "Missing User_id header" });
    }
    req.user = { token: token, id: user_id };
    const loggedIn = await getUserLoggedInStatus(user_id, token);
    if (!loggedIn) {
        if(req.path.startsWith("/pages/")) {
            log("info", `Unauthenticated access attempt to ${req.path}`, { user_id: user_id }, utilities.getCallerInfo(), req.user.id);
            return res.status(401).json({ error: "NOT_LOGGED_IN" });
        }
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    const tempPasswordResult = await db.query("SELECT temp_password FROM users WHERE id = $1", [user_id]);
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
            return res.status(403).json({ error: "TEMP_PASSWORD_CHANGE_REQUIRED" });
        }
    }
    log("info", `User ${user_id} authenticated successfully`, { user_id: user_id }, utilities.getCallerInfo(), req.user.id);
    return next();
};

module.exports = authMiddleware;
