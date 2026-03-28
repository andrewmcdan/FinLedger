/**
 * @fileoverview Route-level integration tests for the rendered dashboard page.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const db = require("../../src/db/db");
const app = require("../../src/server");

async function resetDb() {
    await db.query(`
        TRUNCATE TABLE
            password_history,
            password_expiry_email_tracking,
            logged_in_users,
            trial_balance_lines,
            trial_balance_runs,
            statement_runs,
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
    passwordExpiresAt = "2030-01-01T00:00:00.000Z",
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
            $8::timestamp,
            false
        ) RETURNING id, email, username, role, status`,
        [username, email, firstName, lastName, role, status, password, passwordExpiresAt],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
}

async function seedCategories() {
    const categoryNames = [
        ["Assets", "10", 10],
        ["Liabilities", "20", 20],
        ["Equity", "30", 30],
        ["Revenue", "40", 40],
        ["Expenses", "50", 50],
    ];

    for (const [name, prefix, orderIndex] of categoryNames) {
        await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ($1, $2, $3, $4)", [name, name, prefix, orderIndex]);
    }

    const categories = await db.query("SELECT id, name FROM account_categories ORDER BY id ASC");
    const categoryMap = Object.fromEntries(categories.rows.map((row) => [row.name, row.id]));

    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10)", [categoryMap.Assets]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Liabilities', 'Current Liabilities', 10)", [categoryMap.Liabilities]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Retained Earnings', 'Retained Earnings', 10)", [categoryMap.Equity]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Operating Revenue', 'Operating Revenue', 10)", [categoryMap.Revenue]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Operating Expense', 'Operating Expense', 10)", [categoryMap.Expenses]);

    const subcategories = await db.query("SELECT id, name FROM account_subcategories ORDER BY id ASC");
    const subcategoryMap = Object.fromEntries(subcategories.rows.map((row) => [row.name, row.id]));

    return { categoryMap, subcategoryMap };
}

async function insertAccount({
    userId,
    accountName,
    accountNumber,
    normalSide,
    statementType,
    accountCategoryId,
    accountSubcategoryId,
    accountOrder,
    initialBalance = 0,
    accountDescription = "",
} = {}) {
    const result = await db.query(
        `INSERT INTO accounts (
            user_id,
            account_name,
            account_number,
            account_description,
            normal_side,
            initial_balance,
            total_debits,
            total_credits,
            balance,
            account_order,
            statement_type,
            status,
            account_category_id,
            account_subcategory_id
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, 0, 0, $6,
            $7, $8, 'active', $9, $10
        ) RETURNING id`,
        [userId, accountName, accountNumber, accountDescription || `${accountName} description`, normalSide, initialBalance, accountOrder, statementType, accountCategoryId, accountSubcategoryId],
    );
    return result.rows[0];
}

async function seedPostedJournalEntry({ createdByUserId, approvedByUserId, entryDate, description, lines }) {
    const totals = lines.reduce(
        (acc, line) => {
            if (line.dc === "debit") {
                acc.debits += Number(line.amount);
            } else {
                acc.credits += Number(line.amount);
            }
            return acc;
        },
        { debits: 0, credits: 0 },
    );

    const journalResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, approved_by, approved_at, posted_at, reference_code)
         VALUES
            ('general', $1::timestamp, $2, 'approved', $3, $4, $5, $5, $6, $1::timestamp, $1::timestamp, $7)
         RETURNING id`,
        [entryDate, description, totals.debits, totals.credits, createdByUserId, approvedByUserId, `JE-DASHBOARD-${Date.now()}-${Math.floor(Math.random() * 100000)}`],
    );

    const journalEntryId = journalResult.rows[0].id;
    let lineNo = 1;
    for (const line of lines) {
        const lineResult = await db.query(
            `INSERT INTO journal_entry_lines
                (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $7)
             RETURNING id`,
            [journalEntryId, lineNo, line.accountId, line.dc, line.amount, line.description || null, createdByUserId],
        );

        await db.query(
            `INSERT INTO ledger_entries
                (account_id, entry_date, dc, amount, description, journal_entry_line_id, journal_entry_id, pr_journal_ref, created_by, updated_by, posted_at, posted_by)
             VALUES
                ($1, $2::timestamp, $3, $4, $5, $6, $7, $8, $9, $9, $2::timestamp, $10)`,
            [line.accountId, entryDate, line.dc, line.amount, description, lineResult.rows[0].id, journalEntryId, `PR-${journalEntryId}`, createdByUserId, approvedByUserId],
        );

        lineNo += 1;
    }
}

async function seedPendingJournalEntry({ createdByUserId, debitAccountId, creditAccountId, amount = 125, journalType = "adjusting", entryDate = "2026-03-20T00:00:00.000Z" }) {
    const referenceCode = `JE-DASH-PENDING-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const entryResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
         VALUES
            ($1, $2, 'Dashboard pending journal entry', 'pending', $3, $3, $4, $4, $5)
         RETURNING id`,
        [journalType, entryDate, amount, createdByUserId, referenceCode],
    );
    const journalEntryId = entryResult.rows[0].id;

    await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 1, $2, 'debit', $3, 'Pending debit line', $4, $4)`,
        [journalEntryId, debitAccountId, amount, createdByUserId],
    );
    await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 2, $2, 'credit', $3, 'Pending credit line', $4, $4)`,
        [journalEntryId, creditAccountId, amount, createdByUserId],
    );
}

function authHeaders({ userId, token }) {
    return {
        authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

function requestPage({ port, path: reqPath, headers = {} }) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method: "GET",
                headers,
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    resolve({ statusCode: res.statusCode, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        req.end();
    });
}

test.beforeEach(async () => {
    await resetDb();
});

test("manager dashboard renders financial ratios and important workflow messages", async () => {
    const manager = await insertUser({ username: "manager_dashboard_1", email: "manager_dashboard_1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_dashboard_1", email: "acct_dashboard_1@example.com", role: "accountant" });
    const managerToken = "manager-dashboard-token-1";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });

    const { categoryMap, subcategoryMap } = await seedCategories();

    const cash = await insertAccount({
        userId: accountant.id,
        accountName: "Cash Dashboard",
        accountNumber: 1000000401,
        normalSide: "debit",
        statementType: "BS",
        accountCategoryId: categoryMap.Assets,
        accountSubcategoryId: subcategoryMap["Current Assets"],
        accountOrder: 10,
        initialBalance: 600,
        accountDescription: "Operating cash",
    });

    const receivables = await insertAccount({
        userId: accountant.id,
        accountName: "Accounts Receivable Dashboard",
        accountNumber: 1000000402,
        normalSide: "debit",
        statementType: "BS",
        accountCategoryId: categoryMap.Assets,
        accountSubcategoryId: subcategoryMap["Current Assets"],
        accountOrder: 11,
        initialBalance: 200,
    });

    const payables = await insertAccount({
        userId: accountant.id,
        accountName: "Accounts Payable Dashboard",
        accountNumber: 2000000401,
        normalSide: "credit",
        statementType: "BS",
        accountCategoryId: categoryMap.Liabilities,
        accountSubcategoryId: subcategoryMap["Current Liabilities"],
        accountOrder: 20,
        initialBalance: 250,
    });

    const retainedEarnings = await insertAccount({
        userId: accountant.id,
        accountName: "Retained Earnings Dashboard",
        accountNumber: 3000000401,
        normalSide: "credit",
        statementType: "RE",
        accountCategoryId: categoryMap.Equity,
        accountSubcategoryId: subcategoryMap["Retained Earnings"],
        accountOrder: 30,
        initialBalance: 500,
    });

    const revenue = await insertAccount({
        userId: accountant.id,
        accountName: "Service Revenue Dashboard",
        accountNumber: 4000000401,
        normalSide: "credit",
        statementType: "IS",
        accountCategoryId: categoryMap.Revenue,
        accountSubcategoryId: subcategoryMap["Operating Revenue"],
        accountOrder: 40,
    });

    const expense = await insertAccount({
        userId: accountant.id,
        accountName: "Operating Expense Dashboard",
        accountNumber: 5000000401,
        normalSide: "debit",
        statementType: "IS",
        accountCategoryId: categoryMap.Expenses,
        accountSubcategoryId: subcategoryMap["Operating Expense"],
        accountOrder: 50,
    });

    await seedPostedJournalEntry({
        createdByUserId: accountant.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-10",
        description: "Revenue earned",
        lines: [
            { accountId: cash.id, dc: "debit", amount: 1000 },
            { accountId: revenue.id, dc: "credit", amount: 1000 },
        ],
    });

    await seedPostedJournalEntry({
        createdByUserId: accountant.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-12",
        description: "Expense paid",
        lines: [
            { accountId: expense.id, dc: "debit", amount: 200 },
            { accountId: cash.id, dc: "credit", amount: 200 },
        ],
    });

    await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: cash.id,
        creditAccountId: payables.id,
        amount: 150,
        journalType: "adjusting",
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const response = await requestPage({
            port,
            path: "/pages/dashboard.html",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });

        assert.equal(response.statusCode, 200);
        assert.match(response.rawBody, /Quick Access/);
        assert.match(response.rawBody, /href="#\/accounts_list"/);
        assert.match(response.rawBody, /href="#\/transactions"/);
        assert.match(response.rawBody, /href="#\/reports"/);
        assert.match(response.rawBody, /href="#\/audit"/);
        assert.match(response.rawBody, /Financial Ratios/);
        assert.match(response.rawBody, /Current Ratio/);
        assert.match(response.rawBody, /Important Messages/);
        assert.match(response.rawBody, /Journal approvals waiting/);
        assert.match(response.rawBody, /dashboard-tone--good/);
        assert.match(response.rawBody, /dashboard-tone--warning/);
        assert.match(response.rawBody, /dashboard-tone--review/);
        assert.doesNotMatch(response.rawBody, /User Management/);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("administrator dashboard keeps user management and the shared ratio dashboard", async () => {
    const admin = await insertUser({ username: "admin_dashboard_1", email: "admin_dashboard_1@example.com", role: "administrator" });
    const manager = await insertUser({ username: "manager_dashboard_2", email: "manager_dashboard_2@example.com", role: "manager" });
    await insertUser({
        username: "pending_dashboard_1",
        email: "pending_dashboard_1@example.com",
        role: "accountant",
        status: "pending",
    });
    await insertUser({
        username: "expired_dashboard_1",
        email: "expired_dashboard_1@example.com",
        role: "accountant",
        status: "active",
        passwordExpiresAt: "2020-01-01T00:00:00.000Z",
    });

    const adminToken = "admin-dashboard-token-1";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });

    const { categoryMap, subcategoryMap } = await seedCategories();
    const cash = await insertAccount({
        userId: admin.id,
        accountName: "Cash Dashboard Admin",
        accountNumber: 1000000501,
        normalSide: "debit",
        statementType: "BS",
        accountCategoryId: categoryMap.Assets,
        accountSubcategoryId: subcategoryMap["Current Assets"],
        accountOrder: 10,
        initialBalance: 500,
    });
    const payables = await insertAccount({
        userId: admin.id,
        accountName: "Accounts Payable Dashboard Admin",
        accountNumber: 2000000501,
        normalSide: "credit",
        statementType: "BS",
        accountCategoryId: categoryMap.Liabilities,
        accountSubcategoryId: subcategoryMap["Current Liabilities"],
        accountOrder: 20,
        initialBalance: 200,
    });
    const revenue = await insertAccount({
        userId: admin.id,
        accountName: "Service Revenue Dashboard Admin",
        accountNumber: 4000000501,
        normalSide: "credit",
        statementType: "IS",
        accountCategoryId: categoryMap.Revenue,
        accountSubcategoryId: subcategoryMap["Operating Revenue"],
        accountOrder: 40,
    });

    await seedPostedJournalEntry({
        createdByUserId: admin.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-10",
        description: "Revenue earned",
        lines: [
            { accountId: cash.id, dc: "debit", amount: 300 },
            { accountId: revenue.id, dc: "credit", amount: 300 },
        ],
    });

    await seedPendingJournalEntry({
        createdByUserId: admin.id,
        debitAccountId: cash.id,
        creditAccountId: payables.id,
        amount: 100,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const response = await requestPage({
            port,
            path: "/pages/dashboard.html",
            headers: authHeaders({ userId: admin.id, token: adminToken }),
        });

        assert.equal(response.statusCode, 200);
        assert.match(response.rawBody, /Quick Access/);
        assert.match(response.rawBody, /Financial Ratios/);
        assert.match(response.rawBody, /Important Messages/);
        assert.match(response.rawBody, /User Management/);
        assert.match(response.rawBody, /data-dashboard-scroll-target="user-management"/);
        assert.match(response.rawBody, /User approvals waiting/);
        assert.match(response.rawBody, /Expired passwords found/);
        assert.match(response.rawBody, /Create User/);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
