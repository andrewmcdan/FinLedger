/**
 * @fileoverview Integration tests for transactions controller functions (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const db = require("../../src/db/db");
const { approveJournalEntry, rejectJournalEntry, listJournalQueue, listLedgerEntries, getJournalEntryDetail, getJournalDocumentDownloadInfo } = require("../../src/controllers/transactions");
const userDocsRoot = path.resolve(__dirname, "../../user-docs");

async function resetDb() {
    await db.query(`
        TRUNCATE TABLE
            password_history,
            password_expiry_email_tracking,
            logged_in_users,
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
        ) RETURNING id`,
        [username, email, firstName, lastName, role, status, password],
    );
    return result.rows[0];
}

async function seedCategories() {
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Assets', 'Assets', '10', 10)");
    await db.query("INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES ('Liabilities', 'Liabilities', '20', 20)");

    const assetsCategory = await db.query("SELECT id FROM account_categories WHERE name = 'Assets'");
    const liabilitiesCategory = await db.query("SELECT id FROM account_categories WHERE name = 'Liabilities'");

    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Assets', 'Current Assets', 10)", [assetsCategory.rows[0].id]);
    await db.query("INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES ($1, 'Current Liabilities', 'Current Liabilities', 10)", [liabilitiesCategory.rows[0].id]);

    return {
        assetsCategoryId: assetsCategory.rows[0].id,
        liabilitiesCategoryId: liabilitiesCategory.rows[0].id,
        assetsSubcategoryId: (await db.query("SELECT id FROM account_subcategories WHERE name = 'Current Assets'")).rows[0].id,
        liabilitiesSubcategoryId: (await db.query("SELECT id FROM account_subcategories WHERE name = 'Current Liabilities'")).rows[0].id,
    };
}

async function insertAccount({ userId, accountName, accountNumber, normalSide, accountCategoryId, accountSubcategoryId, accountOrder }) {
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
            0, 0, 0, 0,
            $6,
            'BS',
            'active',
            $7,
            $8
        ) RETURNING id`,
        [userId, accountName, accountNumber, `${accountName} description`, normalSide, accountOrder, accountCategoryId, accountSubcategoryId],
    );
    return result.rows[0];
}

async function seedPendingJournalEntry({ createdByUserId, debitAccountId, creditAccountId, amount = 125.5 }) {
    const referenceCode = `JE-TEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const entryResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
         VALUES
            ('general', now(), 'Seed pending journal entry', 'pending', $1, $1, $2, $2, $3)
         RETURNING id`,
        [amount, createdByUserId, referenceCode],
    );

    const journalEntryId = entryResult.rows[0].id;

    const debitLine = await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 1, $2, 'debit', $3, 'Debit line', $4, $4)
         RETURNING id`,
        [journalEntryId, debitAccountId, amount, createdByUserId],
    );

    const creditLine = await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 2, $2, 'credit', $3, 'Credit line', $4, $4)
         RETURNING id`,
        [journalEntryId, creditAccountId, amount, createdByUserId],
    );

    return {
        journalEntryId,
        debitLineId: debitLine.rows[0].id,
        creditLineId: creditLine.rows[0].id,
        amount,
    };
}

test.beforeEach(async () => {
    await resetDb();
});

test("approveJournalEntry posts ledger rows and rolls account balances", async () => {
    const manager = await insertUser({ username: "manager1", email: "manager1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct1", email: "acct1@example.com", role: "accountant" });
    const categories = await seedCategories();

    const cash = await insertAccount({
        userId: accountant.id,
        accountName: "Cash",
        accountNumber: 1000000001,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });

    const payables = await insertAccount({
        userId: accountant.id,
        accountName: "Accounts Payable",
        accountNumber: 2000000001,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: cash.id,
        creditAccountId: payables.id,
        amount: 125.5,
    });

    const approved = await approveJournalEntry({
        journalEntryId: seeded.journalEntryId,
        managerUserId: manager.id,
        managerComment: "Approved during test",
    });

    assert.equal(approved.status, "approved");
    assert.equal(approved.manager_comment, "Approved during test");

    const ledgerRows = await db.query("SELECT * FROM ledger_entries WHERE journal_entry_id = $1", [seeded.journalEntryId]);
    assert.equal(ledgerRows.rowCount, 2);

    const cashAccount = await db.query("SELECT total_debits, total_credits, balance FROM accounts WHERE id = $1", [cash.id]);
    assert.equal(Number(cashAccount.rows[0].total_debits), 125.5);
    assert.equal(Number(cashAccount.rows[0].total_credits), 0);
    assert.equal(Number(cashAccount.rows[0].balance), 125.5);

    const payablesAccount = await db.query("SELECT total_debits, total_credits, balance FROM accounts WHERE id = $1", [payables.id]);
    assert.equal(Number(payablesAccount.rows[0].total_debits), 0);
    assert.equal(Number(payablesAccount.rows[0].total_credits), 125.5);
    assert.equal(Number(payablesAccount.rows[0].balance), 125.5);

    const entryState = await db.query("SELECT status, approved_by, approved_at, posted_at FROM journal_entries WHERE id = $1", [seeded.journalEntryId]);
    assert.equal(entryState.rows[0].status, "approved");
    assert.equal(String(entryState.rows[0].approved_by), String(manager.id));
    assert.ok(entryState.rows[0].approved_at);
    assert.ok(entryState.rows[0].posted_at);
});

test("rejectJournalEntry requires reason and leaves entry pending when omitted", async () => {
    const manager = await insertUser({ username: "manager2", email: "manager2@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct2", email: "acct2@example.com", role: "accountant" });
    const categories = await seedCategories();

    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Cash 2",
        accountNumber: 1000000002,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Liability 2",
        accountNumber: 2000000002,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 50,
    });

    await assert.rejects(
        () =>
            rejectJournalEntry({
                journalEntryId: seeded.journalEntryId,
                managerUserId: manager.id,
                managerComment: "",
            }),
        (error) => error?.code === "ERR_JOURNAL_REJECTION_REASON_REQUIRED",
    );

    const entryState = await db.query("SELECT status FROM journal_entries WHERE id = $1", [seeded.journalEntryId]);
    assert.equal(entryState.rows[0].status, "pending");

    const ledgerRows = await db.query("SELECT COUNT(*)::int AS total FROM ledger_entries WHERE journal_entry_id = $1", [seeded.journalEntryId]);
    assert.equal(ledgerRows.rows[0].total, 0);
});

test("rejectJournalEntry updates status/comment and does not post ledger", async () => {
    const manager = await insertUser({ username: "manager3", email: "manager3@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct3", email: "acct3@example.com", role: "accountant" });
    const categories = await seedCategories();

    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Cash 3",
        accountNumber: 1000000003,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Liability 3",
        accountNumber: 2000000003,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 75,
    });

    const rejected = await rejectJournalEntry({
        journalEntryId: seeded.journalEntryId,
        managerUserId: manager.id,
        managerComment: "Rejected for missing details",
    });

    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.manager_comment, "Rejected for missing details");

    const ledgerRows = await db.query("SELECT COUNT(*)::int AS total FROM ledger_entries WHERE journal_entry_id = $1", [seeded.journalEntryId]);
    assert.equal(ledgerRows.rows[0].total, 0);
});

test("approveJournalEntry rejects already-processed journals and remains idempotent", async () => {
    const manager = await insertUser({ username: "manager4", email: "manager4@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct4", email: "acct4@example.com", role: "accountant" });
    const categories = await seedCategories();

    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Cash 4",
        accountNumber: 1000000004,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Liability 4",
        accountNumber: 2000000004,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 99,
    });

    await approveJournalEntry({
        journalEntryId: seeded.journalEntryId,
        managerUserId: manager.id,
        managerComment: "Approved",
    });

    const balancesAfterFirstApproval = await db.query("SELECT id, total_debits, total_credits, balance FROM accounts WHERE id IN ($1, $2) ORDER BY id", [debitAccount.id, creditAccount.id]);

    await assert.rejects(
        () =>
            approveJournalEntry({
                journalEntryId: seeded.journalEntryId,
                managerUserId: manager.id,
                managerComment: "Second approval attempt",
            }),
        (error) => error?.code === "ERR_JOURNAL_ENTRY_NOT_PENDING",
    );

    const balancesAfterSecondApproval = await db.query("SELECT id, total_debits, total_credits, balance FROM accounts WHERE id IN ($1, $2) ORDER BY id", [debitAccount.id, creditAccount.id]);

    assert.deepEqual(balancesAfterSecondApproval.rows, balancesAfterFirstApproval.rows);

    const ledgerRows = await db.query("SELECT COUNT(*)::int AS total FROM ledger_entries WHERE journal_entry_id = $1", [seeded.journalEntryId]);
    assert.equal(ledgerRows.rows[0].total, 2);
});

test("listJournalQueue and getJournalEntryDetail support queue and review retrieval", async () => {
    const manager = await insertUser({ username: "manager5", email: "manager5@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct5", email: "acct5@example.com", role: "accountant" });
    const categories = await seedCategories();

    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Cash Queue",
        accountNumber: 1000000005,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Liability Queue",
        accountNumber: 2000000005,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 141,
    });

    const documentInsert = await db.query(
        `INSERT INTO documents (user_id, title, original_file_name, file_extension, meta_data)
         VALUES ($1, 'Receipt', 'receipt.pdf', '.pdf', '{}'::jsonb)
         RETURNING id`,
        [accountant.id],
    );

    await db.query(
        `INSERT INTO journal_entry_documents (journal_entry_id, document_id, created_by, updated_by)
         VALUES ($1, $2, $3, $3)`,
        [seeded.journalEntryId, documentInsert.rows[0].id, accountant.id],
    );

    await db.query(
        `INSERT INTO journal_entry_line_documents (journal_entry_line_id, document_id, created_by, updated_by)
         VALUES ($1, $2, $3, $3)`,
        [seeded.debitLineId, documentInsert.rows[0].id, accountant.id],
    );

    const queue = await listJournalQueue({
        status: "pending",
        fromDate: "2000-01-01",
        toDate: "2100-01-01",
        search: "Cash Queue",
        limit: 50,
        offset: 0,
    });

    assert.equal(queue.total, 1);
    assert.equal(queue.rows.length, 1);
    assert.equal(queue.rows[0].id, seeded.journalEntryId);

    const detail = await getJournalEntryDetail(seeded.journalEntryId);
    assert.equal(detail.journal_entry.id, seeded.journalEntryId);
    assert.equal(detail.lines.length, 2);
    assert.equal(detail.documents.length, 1);
    assert.equal(detail.lines[0].documents.length, 1);

    await approveJournalEntry({
        journalEntryId: seeded.journalEntryId,
        managerUserId: manager.id,
        managerComment: "Approved from detail test",
    });

    const approvedQueue = await listJournalQueue({ status: "approved", search: "Cash Queue" });
    assert.equal(approvedQueue.total, 1);
});

test("listLedgerEntries and getJournalDocumentDownloadInfo provide live ledger/document access data", async () => {
    const manager = await insertUser({ username: "manager6", email: "manager6@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct6", email: "acct6@example.com", role: "accountant" });
    const categories = await seedCategories();

    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Cash Ledger",
        accountNumber: 1000000006,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Liability Ledger",
        accountNumber: 2000000006,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 64,
    });

    const documentInsert = await db.query(
        `INSERT INTO documents (user_id, title, original_file_name, file_extension, meta_data)
         VALUES ($1, 'Ledger Receipt', 'ledger_receipt.pdf', '.pdf', '{}'::jsonb)
         RETURNING id, file_name::text AS file_name, file_extension`,
        [accountant.id],
    );
    const document = documentInsert.rows[0];
    const storedFilePath = path.join(userDocsRoot, `${document.file_name}${document.file_extension}`);
    fs.mkdirSync(userDocsRoot, { recursive: true });
    fs.writeFileSync(storedFilePath, Buffer.from("ledger-doc-content", "utf8"));

    try {
        await db.query(
            `INSERT INTO journal_entry_documents (journal_entry_id, document_id, created_by, updated_by)
             VALUES ($1, $2, $3, $3)`,
            [seeded.journalEntryId, document.id, accountant.id],
        );
        await db.query(
            `INSERT INTO journal_entry_line_documents (journal_entry_line_id, document_id, created_by, updated_by)
             VALUES ($1, $2, $3, $3)`,
            [seeded.debitLineId, document.id, accountant.id],
        );

        const detail = await getJournalEntryDetail(seeded.journalEntryId);
        assert.equal(detail.documents.length, 1);
        assert.match(detail.documents[0].download_url, new RegExp(`/api/transactions/journal-entry/${seeded.journalEntryId}/documents/${document.id}/download$`));
        assert.equal(detail.lines[0].documents.length, 1);
        assert.match(detail.lines[0].documents[0].download_url, new RegExp(`/api/transactions/journal-entry/${seeded.journalEntryId}/documents/${document.id}/download$`));

        const downloadInfo = await getJournalDocumentDownloadInfo({
            journalEntryId: seeded.journalEntryId,
            documentId: document.id,
        });
        assert.equal(downloadInfo.id, document.id);
        assert.equal(downloadInfo.file_path, storedFilePath);

        await approveJournalEntry({
            journalEntryId: seeded.journalEntryId,
            managerUserId: manager.id,
            managerComment: "Approve for ledger controller test",
        });

        const ledger = await listLedgerEntries({
            accountId: debitAccount.id,
            search: "Cash Ledger",
            limit: 25,
            offset: 0,
        });
        assert.equal(ledger.total, 1);
        assert.equal(ledger.rows.length, 1);
        assert.equal(Number(ledger.rows[0].account_id), Number(debitAccount.id));
        assert.ok(ledger.rows[0].running_balance !== undefined);
        assert.ok(Array.isArray(ledger.t_account.debit_entries));
        assert.ok(Array.isArray(ledger.t_account.credit_entries));
    } finally {
        if (fs.existsSync(storedFilePath)) {
            fs.unlinkSync(storedFilePath);
        }
    }
});
