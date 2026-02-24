const express = require("express");
const router = express.Router();
const accountsController = require("../controllers/accounts");
const { isAdmin } = require("../controllers/users");
const { log } = require("../utils/logger");
const utilities = require("../utils/utilities");
const { sendApiError } = require("../utils/api_messages");

const mapAccountsErrorCode = (error) => {
    const message = error?.message || "";
    if (message.includes("Cannot delete category")) {
        return "ERR_CANNOT_DELETE_CATEGORY_WITH_ACCOUNTS";
    }
    if (message.includes("Cannot delete subcategory")) {
        return "ERR_CANNOT_DELETE_SUBCATEGORY_WITH_ACCOUNTS";
    }
    if (message.includes("Account creation failed")) {
        return "ERR_ACCOUNT_CREATION_FAILED";
    }
    return "ERR_INTERNAL_SERVER";
};

router.get("/account_count", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized account count request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    try {
        log("debug", "Account count requested", { userId }, utilities.getCallerInfo(), userId);
        const { filterField, filterValue, filterMin, filterMax } = req.query;
        const result = await accountsController.getAccountCounts(req.user.id, req.user.token, {
            filterField,
            filterValue,
            filterMin,
            filterMax,
        });
        log("debug", "Account count retrieved", { userId, total: result?.total_accounts }, utilities.getCallerInfo(), userId);
        res.json(result);
    } catch (error) {
        log("error", `Account count request failed: ${error.message}`, { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.get("/list/:offset/:limit", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized account list request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    try {
        log("debug", "Account list requested", { userId, offset: req.params.offset, limit: req.params.limit, query: req.query }, utilities.getCallerInfo(), userId);
        const { filterField, filterValue, filterMin, filterMax, sortField, sortDirection } = req.query;
        const result = await accountsController.listAccounts(req.user.id, req.user.token, Number(req.params.offset), Number(req.params.limit), {
            filterField,
            filterValue,
            filterMin,
            filterMax,
            sortField,
            sortDirection,
        });
        log("debug", "Account list retrieved", { userId, count: result.rowCount }, utilities.getCallerInfo(), userId);
        res.json(result.rows);
    } catch (error) {
        log("error", `Account list request failed: ${error.message}`, { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.post("/create", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized account create request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden account create request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_CREATE_ACCOUNTS");
    }
    const { accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, total_debits, total_credits, accountOrder, statementType, comments, accountOwner } = req.body;
    try {
        log("info", "Creating account via API", { userId, accountOwner, accountName, accountCategory, accountSubcategory }, utilities.getCallerInfo(), userId);
        const newAccount = await accountsController.createAccount(accountOwner, accountName, accountDescription, normalSide, accountCategory, accountSubcategory, balance, initialBalance, total_debits, total_credits, accountOrder, statementType, comments, userId);
        log("info", "Account created via API", { userId, accountId: newAccount?.id, accountOwner }, utilities.getCallerInfo(), userId);
        res.status(201).json(newAccount);
    } catch (error) {
        log("error", `Account create request failed: ${error.message}`, { userId, accountOwner }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.post("/update-account-field", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized account update request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden account update request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_UPDATE_ACCOUNTS");
    }
    try {
        req.body.user_id = userId;
        log("info", "Updating account field via API", { userId, accountId: req.body?.account_id, field: req.body?.field }, utilities.getCallerInfo(), userId);
        const result = await accountsController.updateAccountField(req.body);
        if (result.success) {
            log("info", "Account field updated via API", { userId, accountId: req.body?.account_id, field: req.body?.field }, utilities.getCallerInfo(), userId);
            return res.json({ success: true });
        }
        log("warn", "Account field update rejected", { userId, message: result.message }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 400, "ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD");
    } catch (error) {
        log("error", `Account field update failed: ${error.message}`, { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.get("/account-categories", async (req, res) => {
    try {
        log("debug", "Account categories requested", { userId: req.user?.id }, utilities.getCallerInfo(), req.user?.id);
        const result = await accountsController.listAccountCategories();
        log("debug", "Account categories retrieved", { categoryCount: result?.categories?.length, subcategoryCount: result?.subcategories?.length }, utilities.getCallerInfo(), req.user?.id);
        res.json(result);
    } catch (error) {
        log("error", `Account categories request failed: ${error.message}`, { userId: req.user?.id }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.post("/add-category", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized add category request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden add category request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_ADD_ACCOUNT_CATEGORIES");
    }
    const { categoryName, categoryDescription, accountNumberPrefix, isSubcategory, categoryId, subcategoryName, subcategoryDescription, initialSubcategoryName, initialSubcategoryDescription, orderIndex } = req.body;
    try {
        log("info", "Add category request received", { userId, isSubcategory, categoryName, categoryId, subcategoryName }, utilities.getCallerInfo(), userId);
        let result;
        if (isSubcategory) {
            if (!categoryId || !subcategoryName) {
                log("warn", "Add subcategory request missing required fields", { userId }, utilities.getCallerInfo(), userId);
                return sendApiError(res, 400, "ERR_CATEGORY_AND_SUBCATEGORY_REQUIRED");
            }
            result = await accountsController.addSubcategory(subcategoryName, categoryId, orderIndex, subcategoryDescription, userId);
        } else {
            if (!categoryName || !accountNumberPrefix || !initialSubcategoryName) {
                log("warn", "Add category request missing required fields", { userId }, utilities.getCallerInfo(), userId);
                return sendApiError(res, 400, "ERR_CATEGORY_PREFIX_SUBCATEGORY_REQUIRED");
            }
            result = await accountsController.addCategory(categoryName, accountNumberPrefix, categoryDescription, initialSubcategoryName, initialSubcategoryDescription, orderIndex, userId);
        }
        log("info", "Add category request completed", { userId, isSubcategory }, utilities.getCallerInfo(), userId);
        res.json(result);
    } catch (error) {
        log("error", `Add category request failed: ${error.message}`, { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.delete("/category/:categoryId", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized delete category request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden delete category request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_DELETE_ACCOUNT_CATEGORIES");
    }
    const { categoryId } = req.params;
    try {
        log("info", "Delete category request received", { userId, categoryId }, utilities.getCallerInfo(), userId);
        const result = await accountsController.deleteCategory(categoryId, userId);
        log("info", "Delete category request completed", { userId, categoryId }, utilities.getCallerInfo(), userId);
        res.json(result);
    } catch (error) {
        if (error?.message?.includes("Cannot delete category")) {
            log("warn", `Delete category blocked: ${error.message}`, { userId, categoryId }, utilities.getCallerInfo(), userId);
            return sendApiError(res, 400, "ERR_CANNOT_DELETE_CATEGORY_WITH_ACCOUNTS");
        }
        log("error", `Delete category failed: ${error.message}`, { userId, categoryId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.delete("/subcategory/:subcategoryId", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized delete subcategory request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden delete subcategory request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_DELETE_ACCOUNT_SUBCATEGORIES");
    }
    const { subcategoryId } = req.params;
    try {
        log("info", "Delete subcategory request received", { userId, subcategoryId }, utilities.getCallerInfo(), userId);
        const result = await accountsController.deleteSubcategory(subcategoryId, userId);
        log("info", "Delete subcategory request completed", { userId, subcategoryId }, utilities.getCallerInfo(), userId);
        res.json(result);
    } catch (error) {
        if (error?.message?.includes("Cannot delete subcategory")) {
            log("warn", `Delete subcategory blocked: ${error.message}`, { userId, subcategoryId }, utilities.getCallerInfo(), userId);
            return sendApiError(res, 400, "ERR_CANNOT_DELETE_SUBCATEGORY_WITH_ACCOUNTS");
        }
        log("error", `Delete subcategory failed: ${error.message}`, { userId, subcategoryId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

router.post("/set-account-status", async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        log("warn", "Unauthorized set account status request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await isAdmin(userId, req.user.token))) {
        log("warn", "Forbidden set account status request", { userId }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 403, "ERR_FORBIDDEN_ADMIN_SET_ACCOUNT_STATUS");
    }
    const { account_id, is_active } = req.body;
    try {
        log("info", "Set account status request received", { userId, account_id, status: is_active ? "active" : "inactive" }, utilities.getCallerInfo(), userId);
        const result = await accountsController.setAccountStatus(account_id, is_active ? "active" : "inactive", userId);
        log("info", "Set account status request completed", { userId, account_id, status: is_active ? "active" : "inactive" }, utilities.getCallerInfo(), userId);
        res.json(result);
    } catch (error) {
        log("error", `Set account status failed: ${error.message}`, { userId, account_id }, utilities.getCallerInfo(), userId);
        return sendApiError(res, 500, mapAccountsErrorCode(error));
    }
});

module.exports = router;
