const express = require("express");
const router = express.Router();
const accountsController = require("../controllers/accounts");
const { isAdmin } = require("../controllers/users");

router.get("/list", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const result = await accountsController.listAccounts(req.user.id);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/create", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can create accounts." });
    }
    const { accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, total_debits, total_credits, accountOrder, statementType, comments, accountOwner } = req.body;
    try {
        const newAccount = await accountsController.createAccount(accountOwner, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, total_debits, total_credits, accountOrder, statementType, comments);
        res.status(201).json(newAccount);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
