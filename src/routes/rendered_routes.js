const logger = require("../utils/logger");
const { getCallerInfo } = require("../utils/utilities");
const db = require("../db/db");
const usersController = require("../controllers/users");
const accountsController = require("../controllers/accounts");
const dashboardController = require("../controllers/dashboard");
const { SECURITY_QUESTIONS } = require("../data/security_questions");

async function dashboard(req, res, next) {
    try {
        logger.log("debug", "Rendering dashboard", { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        const result = await db.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
        const role = result.rows[0]?.role || "none";
        const loggedInUsers = await usersController.listLoggedInUsers();
        const users = await usersController.listUsers();
        const currentUserId = Number(req.user.id);
        const dashboardSummary = await dashboardController.buildDashboardSummary({
            userId: currentUserId,
            role,
            users,
        });
        res.render("dashboard", { role, loggedInUsers, users, currentUserId, dashboardSummary });
    } catch (error) {
        logger.log("error", `Dashboard render failed: ${error.message}`, { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        next(error);
    }
}

async function accountsList(req, res, next) {
    try {
        const user = await usersController.getUserById(req.user.id);
        const role = user ? user.role : "none";
        const allUsers = await usersController.listUsers();
        logger.log("debug", "Rendering accounts list", { userId: req.user?.id, role }, getCallerInfo(), req.user?.id);
        const result = await accountsController.listAccounts(req.user.id, req.user.token);
        const accounts = result.rows;
        const allCategories = await accountsController.listAccountCategories();
        res.render("accounts_list", { accounts, role, allUsers, allCategories });
    } catch (error) {
        logger.log("error", `Accounts list render failed: ${error.message}`, { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        next(error);
    }
}

async function forgotPasswordSubmit(req, res, next) {
    const emptyQuestions = {
        security_question_1: "",
        security_question_2: "",
        security_question_3: "",
    };
    const questionLabelMap = Object.values(SECURITY_QUESTIONS)
        .flat()
        .reduce((map, item) => {
            map[item.value] = item.label;
            return map;
        }, {});
    try {
        const resetToken = req.query.reset_token;
        if (!resetToken) {
            logger.log("debug", "Rendering forgot-password submit with empty token", {}, getCallerInfo());
            return res.render("public/forgot-password_submit", { security_questions: emptyQuestions, reset_token: "" });
        }
        const userData = await usersController.getUserByResetToken(resetToken);
        if (!userData) {
            logger.log("warn", "Forgot-password submit with invalid reset token", {}, getCallerInfo());
            return res.render("public/forgot-password_submit", { security_questions: emptyQuestions, reset_token: "" });
        }
        const securityQuestions = await usersController.getSecurityQuestionsForUser(userData.id);
        const resolvedQuestions = securityQuestions
            ? {
                  security_question_1: questionLabelMap[securityQuestions.security_question_1] || securityQuestions.security_question_1 || "",
                  security_question_2: questionLabelMap[securityQuestions.security_question_2] || securityQuestions.security_question_2 || "",
                  security_question_3: questionLabelMap[securityQuestions.security_question_3] || securityQuestions.security_question_3 || "",
              }
            : emptyQuestions;
        return res.render("public/forgot-password_submit", {
            security_questions: resolvedQuestions,
            reset_token: resetToken,
        });
    } catch (error) {
        logger.log("error", `Forgot-password submit render failed: ${error.message}`, {}, getCallerInfo());
        return next(error);
    }
}

async function profile(req, res, next) {
    try {
        logger.log("debug", "Rendering profile page", { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        const result = await db.query("SELECT id, role, first_name, last_name, email, address, password_expires_at, suspension_start_at, suspension_end_at, security_question_1, security_question_2, security_question_3, temp_password FROM users WHERE id = $1", [req.user.id]);
        const user = result.rows[0] || {};
        res.render("profile", { user: user });
    } catch (error) {
        logger.log("error", `Profile render failed: ${error.message}`, { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        next(error);
    }
}

async function transactions(req, res, next) {
    try {
        logger.log("debug", "Rendering transactions page", { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        const result = await db.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
        const role = result.rows[0]?.role || "none";
        res.render("transactions", { role });
    } catch (error) {
        logger.log("error", `Transactions render failed: ${error.message}`, { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        next(error);
    }
}

async function audit(req, res, next) {
    try {
        logger.log("debug", "Rendering audit page", { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        const result = await db.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
        const role = result.rows[0]?.role || "none";
        const users = await usersController.listUsers();
        const accountsResult = await accountsController.listAccounts(req.user.id, req.user.token, 0, 5000);
        const eventTypesResult = await db.query(
            `SELECT DISTINCT event_type
             FROM audit_logs
             WHERE event_type IS NOT NULL AND event_type <> ''
             ORDER BY event_type ASC`,
        );
        const entityTypesResult = await db.query(
            `SELECT DISTINCT entity_type
             FROM audit_logs
             WHERE entity_type IS NOT NULL AND entity_type <> ''
             ORDER BY entity_type ASC`,
        );
        const allUsers = users.map((user) => ({
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            status: user.status,
        }));
        const allAccounts = accountsResult.rows.map((account) => ({
            id: account.id,
            account_name: account.account_name,
            account_number: account.account_number,
            status: account.status,
            user_id: account.user_id,
        }));
        const allEventTypes = eventTypesResult.rows.map((row) => row.event_type);
        const allEntityTypes = entityTypesResult.rows.map((row) => row.entity_type);
        res.render("audit", { role, allUsers, allAccounts, allEventTypes, allEntityTypes });
    } catch (error) {
        logger.log("error", `Audit render failed: ${error.message}`, { userId: req.user?.id }, getCallerInfo(), req.user?.id);
        next(error);
    }
}

module.exports = {
    dashboard,
    accountsList,
    forgotPasswordSubmit,
    profile,
    transactions,
    audit,
};
