const express = require("express");
const authRoutes = require("./routes/auth");
const imageRoutes = require("./routes/images");
const authMiddleware = require("./middleware/auth");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 3000;

// wire in static files found in ../public/

app.use("/images", imageRoutes);
// Mount auth routes at /api/auth
app.use("/api/auth", authRoutes);

app.use(authMiddleware);
// Any routes added after this point will require authentication
app.use(express.static("web"));

app.get("/api/secure-data", (req, res) => {
    res.json({ data: "This is secure data accessible only to authenticated users." });
});

// This if statement ensures the server only starts if this file is run directly.
// This allows the server to be imported without starting it, which is useful for testing.
if (require.main === module) {
    app.listen(PORT, () => {
        logger.log('fatal',`Server listening on port ${PORT}`, {"express": "listening"}, "server.js");
        logger.log('fatal',`Visit http://localhost:${PORT}`, {"express": "listening"}, "server.js");
    });
}

// Export the app for testing purposes
module.exports = app;
