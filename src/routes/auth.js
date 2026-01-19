const express = require("express");

const router = express.Router();

router.get("/status", (req, res) => {
    res.json({ ok: true });
    // Here we should check if the user is logged in by checking the token from their cookies or session
    // against the logged_in_users table in the database.
    // For now, we just return ok: true for demonstration purposes.
});

module.exports = router;
