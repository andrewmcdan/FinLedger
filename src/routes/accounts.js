const express = require("express");
const router = express.Router();
const accountsController = require("../controllers/accounts");
const { isAdmin } = require("../controllers/users");

router.get("/account_count", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const result = await accountsController.getAccountCounts(req.user.id, req.user.token);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/list/:offset/:limit", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const result = await accountsController.listAccounts(req.user.id, req.user.token, Number(req.params.offset), Number(req.params.limit));
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

router.post("/update-account-field", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can update accounts." });
    }
    try {
        const result = await accountsController.updateAccountField(req.body);
        if (result.success) {
            return res.json({ success: true });
        }
        return res.status(400).json({ error: result.message });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.get("/account-categories", async (req, res) => {
    try {
        const result = await accountsController.listAccountCategories();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/add-category", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can add account categories." });
    }
    const { categoryName, categoryDescription, accountNumberPrefix, isSubcategory, categoryId, subcategoryName, subcategoryDescription, initialSubcategoryName, initialSubcategoryDescription, orderIndex } = req.body;
    try {
        let result;
        if (isSubcategory) {
            if (!categoryId || !subcategoryName) {
                return res.status(400).json({ error: "Category and subcategory names are required." });
            }
            result = await accountsController.addSubcategory(subcategoryName, categoryId, orderIndex, subcategoryDescription);
        } else {
            if (!categoryName || !accountNumberPrefix || !initialSubcategoryName) {
                return res.status(400).json({ error: "Category name, account prefix, and at least one subcategory are required." });
            }
            result = await accountsController.addCategory(categoryName, accountNumberPrefix, categoryDescription, initialSubcategoryName, initialSubcategoryDescription);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete("/category/:categoryId", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can delete account categories." });
    }
    const { categoryId } = req.params;
    try {
        const result = await accountsController.deleteCategory(categoryId); 
        res.json(result);
    } catch (error) {
        if (error?.message?.includes("Cannot delete category")) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.delete("/subcategory/:subcategoryId", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can delete account subcategories." });
    }
    const { subcategoryId } = req.params;
    try {
        const result = await accountsController.deleteSubcategory(subcategoryId); 
        res.json(result);
    } catch (error) {
        if (error?.message?.includes("Cannot delete subcategory")) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.post("/set-account-status", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isAdmin(userId, req.user.token))) {
        return res.status(403).json({ error: "Forbidden. Only Admins can set account status." });
    }
    const { account_id, is_active } = req.body;
    try {
        const result = await accountsController.setAccountStatus(account_id, is_active?"active":"inactive");
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
