const authMiddleware = (req, res, next) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid Authorization header" });
    }

    req.user = { id: token };
    // TODO: Verify the token against the logged_in_users table in the database.
    return next();
};

module.exports = authMiddleware;
