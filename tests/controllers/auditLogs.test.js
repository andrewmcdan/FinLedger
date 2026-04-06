/**
 * @fileoverview Integration tests for audit logs controller functions (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../src/db/db");
const { listAuditLogs, listAuditLogsForEntity } = require("../../src/controllers/audit_logs");

async function resetDb() {
    await db.query(`
        TRUNCATE TABLE
            password_history,
            password_expiry_email_tracking,
            logged_in_users,
            adjustment_lines,
            adjustment_metadata,
            journal_entry_line_documents,
            journal_entry_documents,
            ledger_entries,
            journal_entry_lines,
            journal_entries,
            account_metadata_edits,
            account_audits,
            documents,
            audit_logs,
            app_logs,
            accounts,
            account_subcategories,
            account_categories,
            users
        RESTART IDENTITY CASCADE
    `);
}

async function insertUser({
    username,
    email,
    firstName = "Test",
    lastName = "User",
    role = "accountant",
    status = "active",
    password = "ValidPass1!",
} = {}) {
    const result = await db.query(
        `INSERT INTO users (
            username,
            email,
            first_name,
            last_name,
            role,
            status,
            password_hash,
            password_changed_at,
            password_expires_at,
            temp_password
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false
        ) RETURNING id`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

async function insertAuditLog({
    eventType,
    action,
    changedBy,
    entityType,
    entityId,
    beforeImage = null,
    afterImage = null,
    metadata = {},
    changedAt = null,
} = {}) {
    const result = await db.query(
        `INSERT INTO audit_logs (
            event_type,
            action,
            changed_by,
            changed_at,
            entity_type,
            entity_id,
            b_image,
            a_image,
            metadata
        ) VALUES (
            $1, $2, $3, COALESCE($4, now()), $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
        )
        RETURNING *`,
        [
            eventType,
            action,
            changedBy,
            changedAt,
            entityType,
            entityId,
            beforeImage ? JSON.stringify(beforeImage) : null,
            afterImage ? JSON.stringify(afterImage) : null,
            JSON.stringify(metadata || {}),
        ],
    );
    return result.rows[0];
}

test.beforeEach(async () => {
    await resetDb();
});

test("listAuditLogs returns matching audit logs ordered by changed_at desc then id desc", async () => {
    const user = await insertUser({ username: "auditall", email: "auditall@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert_order_test",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
        afterImage: { account_name: "Cash" },
        metadata: { source: "test-1" },
        changedAt: "2026-04-01T10:00:00.000Z",
    });

    await insertAuditLog({
        eventType: "accounts_update_order_test",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 2,
        beforeImage: { comment: "old" },
        afterImage: { comment: "new" },
        metadata: { source: "test-2" },
        changedAt: "2026-04-02T10:00:00.000Z",
    });

    const result = await listAuditLogs({
        entity_type: "accounts",
        changed_by: user.id,
    });

    const matchingRows = result.rows.filter((row) =>
        row.event_type === "accounts_insert_order_test" ||
        row.event_type === "accounts_update_order_test"
    );

    assert.ok(result.total >= 2);
    assert.equal(result.limit, 100);
    assert.equal(result.offset, 0);
    assert.ok(matchingRows.length >= 2);
    assert.equal(matchingRows[0].event_type, "accounts_update_order_test");
    assert.equal(matchingRows[1].event_type, "accounts_insert_order_test");
});

test("listAuditLogs filters by event_type", async () => {
    const user = await insertUser({ username: "auditevent", email: "auditevent@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    const result = await listAuditLogs({ event_type: "accounts_insert" });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].event_type, "accounts_insert");
});

test("listAuditLogs filters by entity_type and entity_id", async () => {
    const user = await insertUser({ username: "auditentity", email: "auditentity@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 10,
    });

    await insertAuditLog({
        eventType: "users_update",
        action: "update",
        changedBy: user.id,
        entityType: "users",
        entityId: 10,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 11,
    });

    const result = await listAuditLogs({
        entity_type: "accounts",
        entity_id: 10,
    });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].entity_type, "accounts");
    assert.equal(Number(result.rows[0].entity_id), 10);
});

test("listAuditLogs filters by changed_by", async () => {
    const userA = await insertUser({ username: "auditchanger1", email: "auditchanger1@example.com" });
    const userB = await insertUser({ username: "auditchanger2", email: "auditchanger2@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: userA.id,
        entityType: "accounts",
        entityId: 1,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: userB.id,
        entityType: "accounts",
        entityId: 1,
    });

    const result = await listAuditLogs({ changed_by: userB.id });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
assert.equal(result.rows[0].changed_by, userB.id);
});

test("listAuditLogs filters by lowercase action value", async () => {
    const user = await insertUser({ username: "auditaction", email: "auditaction@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    const result = await listAuditLogs({ action: "UPDATE" });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].action, "update");
});

test("listAuditLogs filters by start_at and end_at", async () => {
    const user = await insertUser({ username: "auditdates", email: "auditdates@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
        changedAt: "2026-04-01T10:00:00.000Z",
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
        changedAt: "2026-04-05T10:00:00.000Z",
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 2,
        changedAt: "2026-04-10T10:00:00.000Z",
    });

    const result = await listAuditLogs({
        entity_type: "accounts",
        action: "update",
        start_at: "2026-04-02T00:00:00.000Z",
        end_at: "2026-04-06T23:59:59.999Z",
    });

    assert.ok(result.total >= 1);
    assert.ok(result.rows.length >= 1);
    assert.ok(
        result.rows.some(
            (row) =>
                row.event_type === "accounts_update" &&
                row.action === "update" &&
                row.entity_type === "accounts" &&
                Number(row.entity_id) === 1
        )
    );
});

test("listAuditLogs applies limit and offset", async () => {
    const user = await insertUser({ username: "auditpage", email: "auditpage@example.com" });

    await insertAuditLog({
        eventType: "event_page_1",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
        changedAt: "2026-04-01T10:00:00.000Z",
    });

    await insertAuditLog({
        eventType: "event_page_2",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 2,
        changedAt: "2026-04-02T10:00:00.000Z",
    });

    await insertAuditLog({
        eventType: "event_page_3",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 3,
        changedAt: "2026-04-03T10:00:00.000Z",
    });

    const fullResult = await listAuditLogs({
        changed_by: user.id,
        entity_type: "accounts",
    });

    const matchingRows = fullResult.rows.filter((row) =>
        row.event_type === "event_page_1" ||
        row.event_type === "event_page_2" ||
        row.event_type === "event_page_3"
    );

    assert.ok(matchingRows.length >= 3);

    const pagedResult = await listAuditLogs({
        changed_by: user.id,
        entity_type: "accounts",
        limit: 1,
        offset: 1,
    });

    const pagedMatchingRows = pagedResult.rows.filter((row) =>
        row.event_type === "event_page_1" ||
        row.event_type === "event_page_2" ||
        row.event_type === "event_page_3"
    );

    assert.equal(pagedResult.limit, 1);
    assert.equal(pagedResult.offset, 1);
    assert.equal(pagedResult.rows.length, 1);
    assert.equal(pagedMatchingRows.length, 1);
    assert.equal(pagedMatchingRows[0].event_type, "event_page_2");
});

test("listAuditLogs normalizes invalid limit and offset to safe defaults", async () => {
    const user = await insertUser({ username: "auditnorm", email: "auditnorm@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    const result = await listAuditLogs({
        limit: "not-a-number",
        offset: "bad-offset",
    });

    assert.ok(result.total >= 1);
    assert.ok(result.rows.length >= 1);
    assert.equal(result.limit, 100);
    assert.equal(result.offset, 0);
});

test("listAuditLogs clamps limit to max 500 and offset to minimum 0", async () => {
    const user = await insertUser({ username: "auditclamp", email: "auditclamp@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    const result = await listAuditLogs({
        limit: 9999,
        offset: -50,
    });

    assert.equal(result.limit, 500);
    assert.equal(result.offset, 0);
});

test("listAuditLogs ignores non-numeric entity_id and changed_by filters", async () => {
    const user = await insertUser({ username: "auditignore", email: "auditignore@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 1,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 2,
    });

    const result = await listAuditLogs({
        entity_id: "abc",
        changed_by: "not-a-number",
    });

assert.ok(result.total >= 2);
assert.ok(result.rows.length >= 2);

const matchingRows = result.rows.filter(
    (row) => row.event_type === "accounts_update" || row.event_type === "accounts_insert"
);

assert.ok(matchingRows.length >= 2);
assert.equal(matchingRows[0].event_type, "accounts_update");
assert.equal(matchingRows[1].event_type, "accounts_insert");
});

test("listAuditLogsForEntity delegates to entity-specific filtering", async () => {
    const user = await insertUser({ username: "auditentityhelper", email: "auditentityhelper@example.com" });

    await insertAuditLog({
        eventType: "accounts_insert",
        action: "insert",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 42,
    });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 99,
    });

    const result = await listAuditLogsForEntity("accounts", 42);

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].entity_type, "accounts");
    assert.equal(Number(result.rows[0].entity_id), 42);
});

test("listAuditLogs returns audit payload fields including before, after, and metadata", async () => {
    const user = await insertUser({ username: "auditpayload", email: "auditpayload@example.com" });

    await insertAuditLog({
        eventType: "accounts_update",
        action: "update",
        changedBy: user.id,
        entityType: "accounts",
        entityId: 77,
        beforeImage: { comment: "before value" },
        afterImage: { comment: "after value" },
        metadata: { changed_field: "comment" },
    });

    const result = await listAuditLogs({ entity_id: 77 });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].b_image.comment, "before value");
    assert.equal(result.rows[0].a_image.comment, "after value");
    assert.equal(result.rows[0].metadata.changed_field, "comment");
});