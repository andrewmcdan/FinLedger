const { getUserLoggedInStatus } = require("../controllers/users.js");
const logger = require("../utils/logger.js");

const non_auth_paths_begin = ["/api/auth/status", "/api/auth/logout", "/public_images", "/js/utils", "/js/app.js", "/css/", "/pages/public", "/js/pages/public"];
const non_auth_paths_full = ["/", "/not_found.html", "/not_logged_in.html"];

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
            logger.log("info", `Unauthenticated access attempt to ${req.path}`, { user_id: user_id }, "authMiddleware");
            // Redirect to login page for page requests
            return res.redirect("/pages/public/login.html");
        }
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    logger.log("info", `User ${user_id} authenticated successfully`, { user_id: user_id }, "authMiddleware");
    return next();
};

module.exports = authMiddleware;
