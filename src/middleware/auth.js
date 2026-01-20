const { getUserLoggedInStatus } = require("../controllers/users.js");

const authMiddleware = (req, res, next) => {
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
    return next();
};

module.exports = authMiddleware;
