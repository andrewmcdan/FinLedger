const { getUserLoggedInStatus } = require("../controllers/users.js");
const logger = require("../utils/logger.js");

const non_auth_paths_begin = ["/api/auth/status", "/images", "/js/utils", "/js/utils", "/js/app.js", "/css/", "/pages/public", "/js/pages/public"];
const non_auth_paths_full = ["/"];

const authMiddleware = (req, res, next) => {
    // if req is for a public route, skip authentication
    console.log(req.path);
    // return next();
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
    const user_id = req.get("User_ID");
    if (!user_id) {
        return res.status(401).json({ error: "Missing User_ID header" });
    }
    req.user = { token: token, id: user_id };
    const loggedIn = getUserLoggedInStatus(user_id, token);
    if (!loggedIn) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    logger.log("info", `User ${user_id} authenticated successfully`, { user_id: user_id }, "authMiddleware");
    return next();
};

module.exports = authMiddleware;
