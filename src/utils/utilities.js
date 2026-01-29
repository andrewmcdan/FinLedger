const db = require("../db/db.js");
const fs = require("fs").promises;
const path = require("path");
const {log} = require("./logger.js");

function getCallerInfo() {
    const stack = new Error().stack;
    const lines = stack.split("\n").map((l) => l.trim());

    const caller = lines[2] || lines[1];

    const match = caller.match(/\((.*):(\d+):(\d+)\)$/) || caller.match(/at (.*):(\d+):(\d+)$/);

    if (!match) return null;

    return {
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
    };
}

function sanitizeInput(input) {
    if (typeof input !== "string") {
        return input;
    }
    return input.replace(/[<>&"'`]/g, (char) => {
        switch (char) {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case '"':
                return "&quot;";
            case "'":
                return "&#x27;";
            case "`":
                return "&#x60;";
            default:
                return char;
        }
    });
}

function generateRandomToken(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

async function cleanupUserData(){
    // get a list of all the files in user_icons folder
    // and user_docs folder, and remove any files that are not referenced
    // in the database.
    const userIconsDir = path.resolve(__dirname, "../..", "user-icons");
    const userDocsDir = path.resolve(__dirname, "../..", "user-docs");
    try {
        log("debug", "Starting cleanupUserData", { userIconsDir, userDocsDir }, getCallerInfo());
        const iconFiles = await fs.readdir(userIconsDir);
        const docFiles = await fs.readdir(userDocsDir);
        log("debug", "Loaded user file inventories", { iconCount: iconFiles.length, docCount: docFiles.length }, getCallerInfo());
        const dbIconFilesResult = await db.query("SELECT user_icon_path FROM users WHERE user_icon_path IS NOT NULL");
        const dbDocFilesResult = await db.query("SELECT file_name FROM documents WHERE file_name IS NOT NULL");
        const dbIconFiles = new Set(dbIconFilesResult.rows.map(r => path.basename(r.user_icon_path)));
        const dbDocFiles = new Set(dbDocFilesResult.rows.map(r => r.file_name));
        let deletedIcons = 0;
        let deletedDocs = 0;
        for(const file of iconFiles){
            if(!dbIconFiles.has(file)){
                await fs.unlink(path.join(userIconsDir, file));
                log("info", `Deleted unreferenced user icon file: ${file}`, {}, getCallerInfo());
                deletedIcons += 1;
            }
        }
        for(const file of docFiles){
            if(!dbDocFiles.has(file)){
                await fs.unlink(path.join(userDocsDir, file));
                log("info", `Deleted unreferenced user document file: ${file}`, {}, getCallerInfo());
                deletedDocs += 1;
            }
        }
        log("debug", "cleanupUserData completed", { deletedIcons, deletedDocs }, getCallerInfo());
    } catch (error) {
        log("error", `Error during cleanupUserData: ${error.message}`, {}, getCallerInfo()); 
    }
}

async function cleanupLogs() {
    const appLogsRetentionDays = parseInt(process.env.APP_LOGS_RETENTION_DAYS) || 30;
    const auditLogsRetentionDays = parseInt(process.env.AUDIT_LOGS_RETENTION_DAYS) || 180;
    try {
        const appLogsCutoff = new Date(Date.now() - appLogsRetentionDays * 24 * 60 * 60 * 1000);
        const auditLogsCutoff = new Date(Date.now() - auditLogsRetentionDays * 24 * 60 * 60 * 1000);
        const appLogsResult = await db.query("DELETE FROM app_logs WHERE created_at < $1 RETURNING *", [appLogsCutoff]);
        const auditLogsResult = await db.query("DELETE FROM audit_logs WHERE created_at < $1 RETURNING *", [auditLogsCutoff]);
        log("info", `Cleaned up logs: ${appLogsResult.rowCount} app logs and ${auditLogsResult.rowCount} audit logs deleted`, {}, getCallerInfo());
    } catch (error) {
        log("error", `Error during cleanupLogs: ${error.message}`, {}, getCallerInfo());
    }
}

module.exports = {
    getCallerInfo,
    sanitizeInput,
    generateRandomToken,
    cleanupUserData,
    cleanupLogs,   
};
