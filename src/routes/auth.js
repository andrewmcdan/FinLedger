const express = require("express");
const { getUserLoggedInStatus } = require("../controllers/users.js");
const router = express.Router();

// Endpoint to check if user is logged in
router.get("/status", async (req, res) => {
    const authHeader = req.get("authorization");
    if (!authHeader) {
        return res.json({ ok: false , loggedIn: false});
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.json({ ok: false , loggedIn: false});
    }
    const user_id = req.get("User_ID");
    if (!user_id) {
        return res.json({ ok: false , loggedIn: false});
    }
    req.user = { token: token, id: user_id };
    const loggedIn = await getUserLoggedInStatus(user_id, token);
    res.json({ ok: true , loggedIn: loggedIn});
});

module.exports = router;
