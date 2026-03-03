const express = require("express");
const path = require("path");
const ejs = require("ejs");
const authRoutes = require("./routes/auth");
const imageRoutes = require("./routes/images");
const userDocRoutes = require("./routes/user_docs");
const authMiddleware = require("./middleware/auth");
const logger = require("./utils/logger");
const { getCallerInfo, cleanupUserData, cleanupLogs } = require("./utils/utilities");
const usersRoutes = require("./routes/users");
const usersController = require("./controllers/users");
const accountsRoutes = require("./routes/accounts");
const auditLogsRoutes = require("./routes/audit_logs");
const messagesRoutes = require("./routes/messages");
const transactionsRoutes = require("./routes/transactions");
const { dashboard, accountsList, forgotPasswordSubmit, profile, transactions } = require("./routes/rendered_routes");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.engine("html", ejs.renderFile);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "..", "web", "pages"));
app.use("/api/auth", authRoutes);
app.use("/api/messages", messagesRoutes);

app.use(authMiddleware);
// Any routes added after this point will require authentication
app.get("/pages/dashboard.html", dashboard);
app.get("/pages/accounts_list.html", accountsList);
app.get("/pages/transactions.html", transactions);
app.get("/pages/public/forgot-password_submit.html", forgotPasswordSubmit);
app.get("/pages/profile.html", profile);
app.use(express.static("web"));
app.use("/api/documents", userDocRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/audit-logs", auditLogsRoutes);
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
                await usersController.resetStaleFailedLoginAttempts();
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
                await cleanupUserData();
            } catch (error) {
                logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
            }
        },
        60 * 60 * 1000,
    ); // every hour

    setInterval(
        async () => {
            try {
                await cleanupLogs();
            } catch (error) {
                logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
            }
        },
        24 * 60 * 60 * 1000,
    ); // every 24 hours
}

// Export the app for testing purposes
module.exports = app;
