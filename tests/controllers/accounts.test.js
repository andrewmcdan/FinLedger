/**
 * @fileoverview Integration tests for accounts controller functions (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../src/db/db");
const accountsController = require("../../src/controllers/accounts");

const ACCOUNT_COUNT = 100;

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, account_subcategories, account_categories, accounts, users RESTART IDENTITY CASCADE");
}

async function ensureCategoryAndSubcategory({ categoryName, subcategoryName, prefix, orderIndex }) {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING", [categoryName, `${categoryName} category`, prefix]);
    const categoryResult = await db.query("SELECT id FROM account_categories WHERE name = $1", [categoryName]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING", [categoryResult.rows[0].id, subcategoryName, `${subcategoryName} subcategory`, orderIndex]);
}

async function insertUser({ username = "acct-user", email = "acct-user@example.com", firstName = "Test", lastName = "User", role = "accountant", status = "active", password = "ValidPass1!" } = {}) {
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

test.beforeEach(async () => {
    await resetDb();
    await ensureCategoryAndSubcategory({
        categoryName: "Assets",
        subcategoryName: "Current Assets",
        prefix: "10",
        orderIndex: 10,
    });
});

test("createAccount allows multiple accounts in same category/subcategory", async () => {
    const user = await insertUser({ username: "acct1", email: "acct1@example.com" });

    const accountNumbers = new Set();

    const accountOrder = 1;

    for (let i = 0; i < ACCOUNT_COUNT; i += 1) {
        const created = await accountsController.createAccount(user.id, `Account ${i + 1}`, `Test account ${i + 1}`, "debit", "Assets", "Current Assets", 100 + i, 100 + i, 0, 0, accountOrder, "Balance Sheet", `batch-${i + 1}`);

        const accountNumber = String(created.account_number).padStart(10, "0");
        console.log(`[accounts.test] account number ${i + 1}: ${accountNumber}`);
        accountNumbers.add(accountNumber);
    }

    assert.equal(accountNumbers.size, ACCOUNT_COUNT);
    const sortedNumbers = [...accountNumbers].sort();
    const prefix = sortedNumbers[0].slice(0, 6);
    const suffixes = sortedNumbers.map((number) => number.slice(6));

    for (const number of sortedNumbers) {
        assert.equal(number.length, 10);
        assert.ok(number.startsWith(prefix));
    }

    assert.equal(new Set(suffixes).size, ACCOUNT_COUNT);
    assert.equal(suffixes[0], "0000");
    assert.equal(suffixes[ACCOUNT_COUNT - 1], String(ACCOUNT_COUNT - 1).padStart(4, "0"));
});

test("createAccount rejects invalid statement types", async () => {
    const user = await insertUser({ username: "acct2", email: "acct2@example.com" });
    await assert.rejects(() => accountsController.createAccount(user.id, "Invalid Statement", "Bad statement type", "debit", "Assets", "Current Assets", 0, 0, 0, 0, 1, "NotAStatement", ""), /Invalid statement type/);
});

test("createAccount rejects unknown categories or subcategories", async () => {
    const user = await insertUser({ username: "acct3", email: "acct3@example.com" });

    await assert.rejects(() => accountsController.createAccount(user.id, "Missing Category", "Category not found", "debit", "Missing Category", "Current Assets", 0, 0, 0, 0, 1, "BS", ""), /Account category not found/);

    await assert.rejects(() => accountsController.createAccount(user.id, "Missing Subcategory", "Subcategory not found", "debit", "Assets", "Missing Subcategory", 0, 0, 0, 0, 1, "BS", ""), /Account subcategory not found/);
});

test("addCategory places duplicate order index between neighbors", async () => {
    await accountsController.addCategory(
        "Liabilities",
        "20",
        "Liability category",
        "Current Liabilities",
        "Liabilities due within one year",
        20,
    );

    const inserted = await accountsController.addCategory(
        "Equity",
        "30",
        "Equity category",
        "Common Stock",
        "Owner equity",
        10,
    );

    assert.equal(Number(inserted.category.order_index), 15);
});

test("addSubcategory places duplicate order index between neighbors", async () => {
    const categoryResult = await db.query("SELECT id FROM account_categories WHERE name = $1", ["Assets"]);
    const categoryId = categoryResult.rows[0]?.id;
    assert.ok(categoryId);

    await accountsController.addSubcategory(
        "Fixed Assets",
        categoryId,
        20,
        "Long-term assets",
    );

    const inserted = await accountsController.addSubcategory(
        "Liquid Assets",
        categoryId,
        10,
        "Highly liquid assets",
    );

    assert.equal(Number(inserted.order_index), 15);
});

test("account create/update writes audit log with before and after images", async () => {
    const admin = await insertUser({ username: "acct-admin", email: "acct-admin@example.com", role: "administrator" });
    const created = await accountsController.createAccount(
        admin.id,
        "Audit Account",
        "Audit account",
        "debit",
        "Assets",
        "Current Assets",
        0,
        0,
        0,
        0,
        1,
        "BS",
        "initial comment",
        admin.id,
    );

    const insertAudit = await db.query(
        "SELECT action, changed_by, b_image, a_image, changed_at FROM audit_logs WHERE entity_type = 'accounts' AND entity_id = $1 AND action = 'insert' ORDER BY id DESC LIMIT 1",
        [created.id],
    );
    assert.equal(insertAudit.rowCount, 1);
    assert.equal(insertAudit.rows[0].action, "insert");
    assert.equal(String(insertAudit.rows[0].changed_by), String(admin.id));
    assert.equal(insertAudit.rows[0].b_image, null);
    assert.equal(insertAudit.rows[0].a_image.account_name, "Audit Account");
    assert.equal(insertAudit.rows[0].a_image.comment, "initial comment");
    assert.ok(insertAudit.rows[0].changed_at);

    const updateResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "updated comment",
        user_id: admin.id,
    });
    assert.equal(updateResult.success, true);

    const updateAudit = await db.query(
        "SELECT action, changed_by, b_image, a_image, changed_at FROM audit_logs WHERE entity_type = 'accounts' AND entity_id = $1 AND action = 'update' ORDER BY id DESC LIMIT 1",
        [created.id],
    );
    assert.equal(updateAudit.rowCount, 1);
    assert.equal(updateAudit.rows[0].action, "update");
    assert.equal(String(updateAudit.rows[0].changed_by), String(admin.id));
    assert.equal(updateAudit.rows[0].b_image.comment, "initial comment");
    assert.equal(updateAudit.rows[0].a_image.comment, "updated comment");
    assert.ok(updateAudit.rows[0].changed_at);
});

test("no-op account updates do not write audit log entries", async () => {
    const admin = await insertUser({ username: "acct-noop-admin", email: "acct-noop-admin@example.com", role: "administrator" });
    const created = await accountsController.createAccount(
        admin.id,
        "No-op Audit Account",
        "No-op audit account",
        "debit",
        "Assets",
        "Current Assets",
        0,
        0,
        0,
        0,
        1,
        "BS",
        "steady comment",
        admin.id,
    );

    const countUpdates = async () => {
        const result = await db.query(
            "SELECT COUNT(*)::int AS total FROM audit_logs WHERE entity_type = 'accounts' AND entity_id = $1 AND action = 'update'",
            [created.id],
        );
        return result.rows[0].total;
    };

    assert.equal(await countUpdates(), 0);

    const noopResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "steady comment",
        user_id: admin.id,
    });
    assert.equal(noopResult.success, true);
    assert.equal(await countUpdates(), 0);

    const changedResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "changed comment",
        user_id: admin.id,
    });
    assert.equal(changedResult.success, true);
    assert.equal(await countUpdates(), 1);

    const secondNoopResult = await accountsController.updateAccountField({
        account_id: created.id,
        field: "comment",
        value: "changed comment",
        user_id: admin.id,
    });
    assert.equal(secondNoopResult.success, true);
    assert.equal(await countUpdates(), 1);
});
