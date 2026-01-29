/**
 * this file to handle user document routes for uploading and retrieving user documents.
 */

const path = require("path");
const express = require("express");
const router = express.Router();
const userDocsPath = path.resolve(__dirname, "./../../user-docs/");
const { log } = require("../utils/logger");
const utilities = require("../utils/utilities");

router.get("/:filename", (req, res) => {
    const filename = req.params.filename;
    log("warn", "User document retrieval requested but not implemented", { filename, path: req.path }, utilities.getCallerInfo(), req.user?.id);
    // TODO: Look up the doc in the db. 
    // Then check that the user has permission to access this document.

    res.send("Document retrieval not yet implemented.");
});

router.post("/upload", (req, res) => {
    log("warn", "User document upload requested but not implemented", { path: req.path }, utilities.getCallerInfo(), req.user?.id);
    // TODO: Handle file upload. Record in the db and save the file to user-docs/ using
    // the filename uuid that postgres generates.
    // INSERT INTO user_documents (user_id, title, file_extension, upload_at, meta_data) VALUES ($1, $2, $3, NOW(), $4) RETURNING file_name;

    res.send("Document upload not yet implemented.");
});

module.exports = router;
