const db = require("../db/db");

// Get LOG_TO_FILE, LOG_FILE_PATH, LOG_TO_FILE_LEVEL, LOG_TO_DB, DB_LOG_LEVEL, LOG_TO_CONSOLE, CONSOLE_LOG_LEVEL from environment variables
const LOG_TO_FILE = process.env.LOG_TO_FILE === "true";
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || "app.log";
const LOG_TO_FILE_LEVEL = process.env.LOG_TO_FILE_LEVEL || "info";
const LOG_TO_DB = process.env.LOG_TO_DB === "true";
const DB_LOG_LEVEL = process.env.DB_LOG_LEVEL || "error";
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== "false";
const CONSOLE_LOG_LEVEL = process.env.CONSOLE_LOG_LEVEL || "debug";

// Define log levels
const levels = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };

/**
 * Log an event. Depending on configuration, logs to console, file, and/or database.
 * @param {*} level One of: trace, debug, info, warn, error, fatal
 * @param {*} message The message to log
 * @param {*} context Additional context or metadata for the log
 * @param {*} source Source information. Use getCallerInfo() from utilities.js to get this.
 * @param {*} user_id ID of the user associated with the log event. Optional.
 * @param {Object} options Optional logging options.
 * @param {boolean} options.skipConsole Skip logging to console when true.
 * @param {boolean} options.skipFile Skip logging to file when true.
 * @param {boolean} options.skipDb Skip logging to database when true.
 */
const log = async (level, message, context = null, source = "", user_id = null, options = {}) => {
    const timestamp = new Date().toISOString();
    const levelValue = levels[level] !== undefined ? levels[level] : levels.info;
    const { skipConsole = false, skipFile = false, skipDb = false } = options || {};
    const sourceLabel = source && source.file ? `${source.file}:${source.line}:${source.column}` : "";

    // Log to console
    if (!skipConsole && LOG_TO_CONSOLE && levelValue >= levels[CONSOLE_LOG_LEVEL] && sourceLabel) {
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context===null ? "" : context, sourceLabel);
    } else if (!skipConsole && LOG_TO_CONSOLE && levelValue >= levels[CONSOLE_LOG_LEVEL]) {
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context===null ? "" : context);
    }

    // Log to database
    if (!skipDb && LOG_TO_DB && levelValue >= levels[DB_LOG_LEVEL]) {
        try {
            const queryString = `
                INSERT INTO app_logs (level, message, context, source${user_id ? ", user_id" : ""})
                VALUES ($1, $2, $3, $4${user_id ? ", $5" : ""})
            `;
            const values = [level, message, context, source];
            if (user_id) {
                values.push(user_id);
            }
            await db.query(queryString, values);
        }
        catch (error) {
            console.error("Failed to log to database:", error);
        }
    }

    // Log to file
    if (!skipFile && LOG_TO_FILE && levelValue >= levels[LOG_TO_FILE_LEVEL]) {
        const fs = require("fs");
        const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(context)} ${sourceLabel}\n`;
        // If file doesn't exist, create it
        if (!fs.existsSync(LOG_FILE_PATH)) {
            fs.writeFileSync(LOG_FILE_PATH, "");
        }
        fs.appendFile(LOG_FILE_PATH, logLine, (err) => {
            if (err) {
                console.error("Failed to write log to file:", err);
            }
        });
    }
};

// Audit log function
const logAudit = async (event_type, user_id = null, entity_type = null, entity_id = null, changes = {}, metadata = {}) => {
    const timestamp = new Date().toISOString();
    try {
        const normalizedChanges = changes === null || changes === undefined
            ? {}
            : (typeof changes === "object" ? changes : { value: changes });
        const normalizedMetadata = metadata === null || metadata === undefined
            ? {}
            : (typeof metadata === "object" ? metadata : { value: metadata });
        const beforeImage = normalizedChanges.before || normalizedChanges.b_image || null;
        const afterImage = normalizedChanges.after || normalizedChanges.a_image || null;
        const action = normalizedMetadata.action || event_type;
        const query = `
            INSERT INTO audit_logs (
                event_type, action, user_id, changed_by, entity_type, entity_id,
                changes, metadata, b_image, a_image, changed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
            event_type,
            action,
            user_id,
            user_id,
            entity_type,
            entity_id,
            normalizedChanges,
            normalizedMetadata,
            beforeImage,
            afterImage,
            timestamp,
        ];
        await db.query(query, values);
    }
    catch (error) {
        console.error("Failed to log audit event:", error);
    }
};

const queryAppLogs = async (filters = {}) => {
    // Build dynamic query based on filters
    let query = "SELECT * FROM app_logs WHERE 1=1";
    const values = [];
    let index = 1;
    if (filters.level) {
        query += ` AND level = $${index++}`;
        values.push(filters.level);
    }
    if (filters.startDate) {
        query += ` AND created_at >= $${index++}`;
        values.push(filters.startDate);
    }
    if (filters.endDate) {
        query += ` AND created_at <= $${index++}`;
        values.push(filters.endDate);
    }
    if (filters.source) {
        query += ` AND source = $${index++}`;
        values.push(filters.source);
    }
    query += " ORDER BY created_at DESC LIMIT 100"; // limit to 100 results
    const result = await db.query(query, values);
    return result.rows;
};

const queryAuditLogs = async (filters = {}) => {
    // Build dynamic query based on filters
    let query = "SELECT * FROM audit_logs WHERE 1=1";
    const values = [];
    let index = 1;
    if (filters.event_type) {
        query += ` AND event_type = $${index++}`;
        values.push(filters.event_type);
    }
    if (filters.user_id) {
        query += ` AND user_id = $${index++}`;
        values.push(filters.user_id);
    }
    if (filters.changed_by) {
        query += ` AND changed_by = $${index++}`;
        values.push(filters.changed_by);
    }
    if (filters.entity_type) {
        query += ` AND entity_type = $${index++}`;
        values.push(filters.entity_type);
    }
    if (filters.entity_id) {
        query += ` AND entity_id = $${index++}`;
        values.push(filters.entity_id);
    }
    if (filters.action) {
        query += ` AND action = $${index++}`;
        values.push(filters.action);
    }
    if (filters.startDate) {
        query += ` AND changed_at >= $${index++}`;
        values.push(filters.startDate);
    }
    if (filters.endDate) {
        query += ` AND changed_at <= $${index++}`;
        values.push(filters.endDate);
    }
    query += " ORDER BY changed_at DESC LIMIT 100"; // limit to 100 results
    const result = await db.query(query, values);
    return result.rows;
}

// Export log function
module.exports = {
    log,
    logAudit,
    queryAppLogs,
    queryAuditLogs,
};
