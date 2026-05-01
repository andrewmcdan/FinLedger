/**
 * @fileoverview Route-level integration tests for src/routes/reports.js (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const db = require("../../src/db/db");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

delete require.cache[serverModulePath];
const app = require(serverModulePath);

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

async function insertUser({ username, email, firstName = "Test", lastName = "User", role = "accountant", status = "active", password = "ValidPass1!" } = {}) {
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
        ) RETURNING id, email, username, role`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

async function insertLoggedInUser({ userId, token = "token-1", loginAt = new Date(), logoutAt = new Date(Date.now() + 60 * 60 * 1000) } = {}) {
    await db.query("INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, $3, $4)", [userId, token, loginAt, logoutAt]);
}

async function seedCategories() {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Assets', 'Assets', '10', 10)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Liabilities', 'Liabilities', '20', 20)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Revenue', 'Revenue', '40', 40)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Expenses', 'Expenses', '50', 50)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Equity', 'Equity', '30', 30)");

    const categories = await db.query("SELECT id, name FROM account_categories");
    const categoryMap = Object.fromEntries(categories.rows.map((row) => [row.name, row.id]));

    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10)", [categoryMap.Assets]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Liabilities', 'Current Liabilities', 10)", [categoryMap.Liabilities]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Operating Revenue', 'Operating Revenue', 10)", [categoryMap.Revenue]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Operating Expense', 'Operating Expense', 10)", [categoryMap.Expenses]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Retained Earnings', 'Retained Earnings', 10)", [categoryMap.Equity]);

    const subs = await db.query("SELECT id, name FROM account_subcategories");
    const subMap = Object.fromEntries(subs.rows.map((row) => [row.name, row.id]));

    return { categoryMap, subMap };
}

async function insertAccount({ userId, accountName, accountNumber, normalSide, statementType, accountCategoryId, accountSubcategoryId, accountOrder, initialBalance = 0 }) {
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
            $7,
            $8,
            'active',
            $9,
            $10
        ) RETURNING id`,
        [userId, accountName, accountNumber, `${accountName} description`, normalSide, initialBalance, accountOrder, statementType, accountCategoryId, accountSubcategoryId],
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
        [entryDate, description, totals.debits, totals.credits, createdByUserId, approvedByUserId, `JE-REPORT-${Date.now()}-${Math.floor(Math.random() * 100000)}`],
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

    return journalEntryId;
}

function authHeaders({ userId, token }) {
    return {
        authorization: `Bearer ${token}`,
        "X-User-Id": String(userId),
    };
}

function requestJson({ port, method, path: reqPath, headers = {}, body = null }) {
    const payload = body === null ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method,
                headers: {
                    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                    ...headers,
                },
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    let parsed = null;
                    if (data) {
                        try {
                            parsed = JSON.parse(data);
                        } catch {
                            parsed = null;
                        }
                    }
                    resolve({ statusCode: res.statusCode, body: parsed, rawBody: data });
                });
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

test.beforeEach(async () => {
    await resetDb();
});

test("manager can generate all sprint 4 financial reports", async () => {
    const manager = await insertUser({ username: "manager_reports_1", email: "manager_reports_1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_reports_1", email: "acct_reports_1@example.com", role: "accountant" });
    const managerToken = "manager-reports-token-1";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });

    const { categoryMap, subMap } = await seedCategories();

    const cash = await insertAccount({
        userId: accountant.id,
        accountName: "Cash Reports",
        accountNumber: 1000000301,
        normalSide: "debit",
        statementType: "BS",
        accountCategoryId: categoryMap.Assets,
        accountSubcategoryId: subMap["Current Assets"],
        accountOrder: 10,
    });

    const serviceRevenue = await insertAccount({
        userId: accountant.id,
        accountName: "Service Revenue Reports",
        accountNumber: 4000000301,
        normalSide: "credit",
        statementType: "IS",
        accountCategoryId: categoryMap.Revenue,
        accountSubcategoryId: subMap["Operating Revenue"],
        accountOrder: 40,
    });

    const officeExpense = await insertAccount({
        userId: accountant.id,
        accountName: "Office Expense Reports",
        accountNumber: 5000000301,
        normalSide: "debit",
        statementType: "IS",
        accountCategoryId: categoryMap.Expenses,
        accountSubcategoryId: subMap["Operating Expense"],
        accountOrder: 50,
    });

    const retainedEarnings = await insertAccount({
        userId: accountant.id,
        accountName: "Retained Earnings Reports",
        accountNumber: 3000000301,
        normalSide: "credit",
        statementType: "RE",
        accountCategoryId: categoryMap.Equity,
        accountSubcategoryId: subMap["Retained Earnings"],
        accountOrder: 30,
        initialBalance: 0,
    });

    await seedPostedJournalEntry({
        createdByUserId: accountant.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-10",
        description: "Revenue earned",
        lines: [
            { accountId: cash.id, dc: "debit", amount: 1000 },
            { accountId: serviceRevenue.id, dc: "credit", amount: 1000 },
        ],
    });

    await seedPostedJournalEntry({
        createdByUserId: accountant.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-12",
        description: "Expense paid",
        lines: [
            { accountId: officeExpense.id, dc: "debit", amount: 300 },
            { accountId: cash.id, dc: "credit", amount: 300 },
        ],
    });

    await seedPostedJournalEntry({
        createdByUserId: accountant.id,
        approvedByUserId: manager.id,
        entryDate: "2026-03-15",
        description: "Close to retained earnings",
        lines: [
            { accountId: serviceRevenue.id, dc: "debit", amount: 700 },
            { accountId: retainedEarnings.id, dc: "credit", amount: 700 },
        ],
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const tbResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/reports/trial-balance?as_of=2026-03-31",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });

        assert.equal(tbResponse.statusCode, 200);
        assert.equal(tbResponse.body.report_type, "trial_balance");
        assert.equal(tbResponse.body.title_line, "Adjusted Trial Balance");
        assert.equal(tbResponse.body.heading_lines.length, 3);
        assert.ok(tbResponse.body.subtitle_line);
        assert.equal(tbResponse.body.totals.is_balanced, true);

        const isResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/reports/income-statement?from_date=2026-03-01&to_date=2026-03-14",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });

        assert.equal(isResponse.statusCode, 200);
        assert.equal(isResponse.body.report_type, "income_statement");
        assert.equal(isResponse.body.title_line, "Income Statement");
        assert.equal(isResponse.body.heading_lines.length, 3);
        assert.ok(isResponse.body.subtitle_line);
        assert.equal(Number(isResponse.body.totals.total_revenue), 1000);
        assert.equal(Number(isResponse.body.totals.total_expense), 300);
        assert.equal(Number(isResponse.body.totals.net_income), 700);

        const bsResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/reports/balance-sheet?as_of=2026-03-31",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });

        assert.equal(bsResponse.statusCode, 200);
        assert.equal(bsResponse.body.report_type, "balance_sheet");
        assert.equal(bsResponse.body.title_line, "Balance Sheet");
        assert.equal(bsResponse.body.heading_lines.length, 3);
        assert.ok(bsResponse.body.subtitle_line);
        assert.equal(Number(bsResponse.body.totals.total_assets), 700);
        assert.equal(Number(bsResponse.body.totals.total_liabilities), 0);
        assert.equal(Number(bsResponse.body.totals.total_equity), 700);
        assert.equal(Number(bsResponse.body.totals.total_liabilities_and_equity), 700);
        assert.equal(bsResponse.body.totals.is_balanced, true);

        const reResponse = await requestJson({
            port,
            method: "GET",
            path: "/api/reports/retained-earnings?from_date=2026-03-16&to_date=2026-03-31",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });

        assert.equal(reResponse.statusCode, 200);
        assert.equal(reResponse.body.report_type, "retained_earnings");
        assert.equal(reResponse.body.title_line, "Statement of Retained Earnings");
        assert.equal(reResponse.body.heading_lines.length, 3);
        assert.ok(reResponse.body.subtitle_line);
        assert.equal(Number(reResponse.body.values.beginning_retained_earnings), 700);
        assert.equal(Number(reResponse.body.values.net_income), 0);
        assert.equal(Number(reResponse.body.values.distributions), 0);
        assert.equal(Number(reResponse.body.values.ending_retained_earnings), 700);
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});

test("accountant cannot generate reports", async () => {
    const accountant = await insertUser({ username: "acct_reports_2", email: "acct_reports_2@example.com", role: "accountant" });
    const token = "acct-reports-token-2";
    await insertLoggedInUser({ userId: accountant.id, token });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const response = await requestJson({
            port,
            method: "GET",
            path: "/api/reports/trial-balance?as_of=2026-03-31",
            headers: authHeaders({ userId: accountant.id, token }),
        });

        assert.equal(response.statusCode, 403);
        assert.equal(response.body.errorCode, "ERR_FORBIDDEN");
    } finally {
        server.close();
        await new Promise((resolve) => server.once("close", resolve));
    }
});
