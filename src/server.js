const express = require("express");
const path = require("path");
const ejs = require("ejs");
const authRoutes = require("./routes/auth");
const imageRoutes = require("./routes/images");
const userDocRoutes = require("./routes/user_docs");
const authMiddleware = require("./middleware/auth");
const db = require("./db/db");
const logger = require("./utils/logger");
const { getCallerInfo } = require("./utils/utilities");
const usersRoutes = require("./routes/users");
const usersController = require("./controllers/users");
const accountsRoutes = require("./routes/accounts");
const accountsController = require("./controllers/accounts");
const { SECURITY_QUESTIONS } = require("./data/security_questions");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.engine("html", ejs.renderFile);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "..", "web", "pages"));
app.use("/api/auth", authRoutes);

app.use(authMiddleware);
// Any routes added after this point will require authentication
app.get("/pages/dashboard.html", async (req, res, next) => {
    try {
        const result = await db.query("SELECT role FROM users WHERE id = $1", [req.user.id]);
        const role = result.rows[0]?.role || "none";
        const loggedInUsers = await usersController.listLoggedInUsers();
        const users = await usersController.listUsers();
        const currentUserId = Number(req.user.id);
        res.render("dashboard", { role, loggedInUsers, users, currentUserId });
    } catch (error) {
        next(error);
    }
});
app.get("/pages/accounts_list.html", async (req, res, next) => {
    const user = await usersController.getUserById(req.user.id);
    const role = user ? user.role : "none";
    let allUsers = [];
    if(role == "administrator"){
        allUsers = await usersController.listUsers();;
    }
    console.log("User role:", role);
    try {
        const result = await accountsController.listAccounts(req.user.id, req.user.token);
        const accounts = result.rows;
        res.render("accounts_list", { accounts, role, allUsers });
    } catch (error) {
        next(error);
    }
});
app.get("/pages/public/forgot-password_submit.html", async (req, res, next) => {
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
            return res.render("public/forgot-password_submit", { security_questions: emptyQuestions, reset_token: "" });
        }
        const userData = await usersController.getUserByResetToken(resetToken);
        if (!userData) {
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
        return next(error);
    }
});
app.get("/pages/profile.html", async (req, res, next) => {
    try {
        const result = await db.query("SELECT id, role, first_name, last_name, email, address, password_expires_at, suspension_start_at, suspension_end_at, security_question_1, security_question_2, security_question_3, temp_password FROM users WHERE id = $1", [req.user.id]);
        const user = result.rows[0] || {};
        res.render("profile", { user: user });
    } catch (error) {
        next(error);
    }
});
app.use(express.static("web"));
app.use("/documents", userDocRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/images", imageRoutes);

// This if statement ensures the server only starts if this file is run directly.
// This allows the server to be imported without starting it, which is useful for testing.
if (require.main === module) {
    app.listen(PORT, () => {
        logger.log("info", `Server listening on port ${PORT}`, { express: "listening" }, getCallerInfo());
        logger.log("info", `Visit http://localhost:${PORT}`, { express: "listening" }, getCallerInfo());
    });

    setInterval(
        async () => {
            try {
                await usersController.logoutInactiveUsers();
                await usersController.unsuspendExpiredSuspensions();
            } catch (error) {
                logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
            }
        },
        10 * 60 * 1000,
    ); // every 10 minutes

    setInterval(
        async () => {
            try {
                await usersController.sendPasswordExpiryWarnings();
                await usersController.suspendUsersWithExpiredPasswords();
            } catch (error) {
                logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
            }
        },
        60 * 60 * 1000,
    ); // every hour
}

// Export the app for testing purposes
module.exports = app;
