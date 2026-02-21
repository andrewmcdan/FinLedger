const db = require("../db/db");
const logger = require("../utils/logger");
const utilities = require("../utils/utilities");

const CACHE_TTL_MS = 60 * 1000;
let cachedMessages = new Map();
let cacheLoadedAt = 0;

const applyReplacements = (template, replacements = {}) => {
    if (typeof template !== "string") {
        return "";
    }
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
        if (Object.prototype.hasOwnProperty.call(replacements, key)) {
            return String(replacements[key] ?? "");
        }
        return "";
    });
};

const loadCatalog = async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedMessages.size > 0 && now - cacheLoadedAt < CACHE_TTL_MS) {
        return cachedMessages;
    }
    const result = await db.query("SELECT code, message_text FROM app_messages WHERE is_active = TRUE");
    const nextCatalog = new Map();
    for (const row of result.rows) {
        nextCatalog.set(row.code, row.message_text);
    }
    cachedMessages = nextCatalog;
    cacheLoadedAt = now;
    return cachedMessages;
};

const getMessageByCode = async (code, replacements = {}, fallbackCode = "ERR_UNKNOWN") => {
    try {
        const catalog = await loadCatalog();
        const template = catalog.get(code) || catalog.get(fallbackCode) || "An unknown error occurred.";
        return applyReplacements(template, replacements);
    } catch (error) {
        logger.log("error", `Failed to load message code ${code}: ${error.message}`, {}, utilities.getCallerInfo());
        return "An unknown error occurred.";
    }
};

const getMessagesByCodes = async (codes = []) => {
    const uniqueCodes = Array.from(new Set((codes || []).filter(Boolean)));
    const catalog = await loadCatalog();
    const messages = {};
    for (const code of uniqueCodes) {
        messages[code] = catalog.get(code) || catalog.get("ERR_UNKNOWN") || "An unknown error occurred.";
    }
    return messages;
};

const clearCatalogCache = () => {
    cachedMessages = new Map();
    cacheLoadedAt = 0;
};

module.exports = {
    getMessageByCode,
    getMessagesByCodes,
    clearCatalogCache,
};
