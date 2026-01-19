const path = require("path");

const express = require("express");

const router = express.Router();

router.get("/user-icon.png", (req, res) => {
    // find the user's icon based on req.user.id
    // For now, just send a placeholder image located at ./../user-icons/default.png
    res.sendFile(path.resolve(__dirname, "./../../user-icons/default.png"));

    const pathRoot = path.resolve(__dirname, "./../../user-icons/");
});

module.exports = router;
