/**
 * @fileoverview Integration tests for accounts controller functions (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../src/db/db");
const accountsController = require("../../src/controllers/accounts");

const ACCOUNT_COUNT = 200;

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, accounts, users RESTART IDENTITY CASCADE");
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
        orderIndex: 0,
    });
});

test("createAccount allows multiple accounts in same category/subcategory", async () => {
    const user = await insertUser({ username: "acct1", email: "acct1@example.com" });

    const accountNumbers = new Set();

    const accountOrder = 1;

    for (let i = 0; i < ACCOUNT_COUNT; i += 1) {
        const created = await accountsController.createAccount(user.id, `Account ${i + 1}`, `Test account ${i + 1}`, "debit", "Assets", "Current Assets", 100 + i, 100 + i, 0, 0, accountOrder, "Balance Sheet", `batch-${i + 1}`);

        const accountNumber = String(created.account_number).padStart(8, "0");
        console.log(`[accounts.test] account number ${i + 1}: ${accountNumber}`);
        accountNumbers.add(accountNumber);
    }

    assert.equal(accountNumbers.size, ACCOUNT_COUNT);
    const sortedNumbers = [...accountNumbers].sort();
    const prefix = sortedNumbers[0].slice(0, 6);
    const suffixes = sortedNumbers.map((number) => number.slice(6));

    for (const number of sortedNumbers) {
        assert.equal(number.length, 8);
        assert.ok(number.startsWith(prefix));
    }

    assert.equal(new Set(suffixes).size, ACCOUNT_COUNT);
    assert.equal(suffixes[0], "00");
    assert.equal(suffixes[ACCOUNT_COUNT - 1], String(ACCOUNT_COUNT - 1).padStart(2, "0"));
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
