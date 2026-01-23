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
app.use(express.static("web"));
app.use("/documents", userDocRoutes);
app.use("/api/users", usersRoutes);
app.use("/images", imageRoutes);

setInterval(async () => {
    try {
        await usersController.logoutInactiveUsers();
        await usersController.unsuspendExpiredSuspensions();
    } catch (error) {
        logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
    }
}, 10 * 60 * 1000); // every 10 minutes

setInterval(async () => {
    try {
        await usersController.sendPasswordExpiryWarnings();
        await usersController.suspendUsersWithExpiredPasswords();
    } catch (error) {
        logger.log("error", `Error: ${error.message}`, {}, getCallerInfo());
    }
}, 60 * 60 * 1000); // every hour

// This if statement ensures the server only starts if this file is run directly.
// This allows the server to be imported without starting it, which is useful for testing.
if (require.main === module) {
    app.listen(PORT, () => {
        logger.log("info", `Server listening on port ${PORT}`, { express: "listening" }, getCallerInfo());
        logger.log("info", `Visit http://localhost:${PORT}`, { express: "listening" }, getCallerInfo());
    });
}

// Export the app for testing purposes
module.exports = app;
