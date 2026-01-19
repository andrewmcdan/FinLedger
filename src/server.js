const express = require("express");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// app.get('/', (req, res) => res.send('FinLedger server is running'));

// wire in static files found in ../public/
app.use(express.static("public"));
app.use("/api/auth", authRoutes);

// TODO: Add the authentication middleware here

// This if statement ensures the server only starts if this file is run directly.
// This allows the server to be imported without starting it, which is useful for testing.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`Visit http://localhost:${PORT}`);
    });
}

// Export the app for testing purposes
module.exports = app;
