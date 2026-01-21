/**
 * this file to handle user document routes for uploading and retrieving user documents.
 */

const path = require("path");
const express = require("express");
const router = express.Router();
const userDocsPath = path.resolve(__dirname, "./../../user-docs/");

router.get("/:filename", (req, res) => {
    const filename = req.params.filename;
    // TODO: Look up the doc in the db. 
    // Then check that the user has permission to access this document.

    res.send("Document retrieval not yet implemented.");
});

module.exports = router;