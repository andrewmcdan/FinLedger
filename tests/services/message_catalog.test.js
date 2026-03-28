/**
 * @fileoverview Unit tests for src/services/message_catalog.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../../src/db/db");
const logger = require("../../src/utils/logger");
const messageCatalog = require("../../src/services/message_catalog");

async function upsertTestMessage(code, messageText) {
    await db.query(
        `INSERT INTO app_messages (code, message_text, category, is_active)
         VALUES ($1, $2, 'info', TRUE)
         ON CONFLICT (code) DO UPDATE SET message_text = EXCLUDED.message_text, category = EXCLUDED.category, is_active = EXCLUDED.is_active`,
        [code, messageText],
    );
}

test.beforeEach(async () => {
    messageCatalog.clearCatalogCache();
    await db.query("DELETE FROM app_messages WHERE code LIKE 'TEST_%'");
});

test.afterEach(async () => {
    messageCatalog.clearCatalogCache();
    await db.query("DELETE FROM app_messages WHERE code LIKE 'TEST_%'");
});

test("getMessageByCode applies replacements and respects cache until cleared", async () => {
    await upsertTestMessage("TEST_TEMPLATE", "Hello {{name}}");

    let message = await messageCatalog.getMessageByCode("TEST_TEMPLATE", { name: "Andrew" });
    assert.equal(message, "Hello Andrew");

    await upsertTestMessage("TEST_TEMPLATE", "Updated {{name}}");

    message = await messageCatalog.getMessageByCode("TEST_TEMPLATE", { name: "Andrew" });
    assert.equal(message, "Hello Andrew");

    messageCatalog.clearCatalogCache();
    message = await messageCatalog.getMessageByCode("TEST_TEMPLATE", { name: "Andrew" });
    assert.equal(message, "Updated Andrew");
});

test("getMessagesByCodes de-duplicates inputs and falls back to ERR_UNKNOWN", async () => {
    await upsertTestMessage("TEST_BULK", "Bulk message");
    messageCatalog.clearCatalogCache();

    const messages = await messageCatalog.getMessagesByCodes(["TEST_BULK", "TEST_BULK", "DOES_NOT_EXIST"]);

    assert.deepEqual(Object.keys(messages).sort(), ["DOES_NOT_EXIST", "TEST_BULK"]);
    assert.equal(messages.TEST_BULK, "Bulk message");
    assert.equal(messages.DOES_NOT_EXIST, "An unknown error occurred.");
});

test("getMessageByCode returns the generic fallback when the catalog load fails", async () => {
    const originalQuery = db.query;
    const originalLog = logger.log;
    messageCatalog.clearCatalogCache();
    db.query = async () => {
        throw new Error("catalog unavailable");
    };
    logger.log = async () => {};

    try {
        const message = await messageCatalog.getMessageByCode("TEST_FAILING_CODE");
        assert.equal(message, "An unknown error occurred.");
    } finally {
        db.query = originalQuery;
        logger.log = originalLog;
        messageCatalog.clearCatalogCache();
    }
});
