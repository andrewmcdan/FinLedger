const express = require("express");
const authRoutes = require("./routes/auth");
const imageRoutes = require("./routes/images");
const userDocRoutes = require("./routes/user_docs");
const authMiddleware = require("./middleware/auth");
const logger = require("./utils/logger");
const { getCallerInfo } = require("./utils/utilities");

const app = express();
const PORT = process.env.PORT || 3000;

// wire in static files found in ../public/

app.use("/images", imageRoutes);
// Mount auth routes at /api/auth (public)
app.use("/api/auth", authRoutes);

app.use(authMiddleware);
// Any routes added after this point will require authentication
app.use(express.static("web"));
app.use("/documents", userDocRoutes);
app.use("api/users", require("./routes/users"));

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
