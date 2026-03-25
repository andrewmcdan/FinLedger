/**
 * @fileoverview Route-level integration tests for src/routes/transactions.js (real DB).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const db = require("../../src/db/db");

const emailCalls = [];
const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");
const serverModulePath = path.resolve(__dirname, "../../src/server.js");

require.cache[emailModulePath] = {
    id: emailModulePath,
    filename: emailModulePath,
    loaded: true,
    exports: {
        sendEmail: async (to, subject, body) => {
            emailCalls.push({ to, subject, body });
            return { accepted: [to], messageId: "test" };
        },
    },
};

delete require.cache[serverModulePath];
const app = require(serverModulePath);
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

async function seedPendingJournalEntry({ createdByUserId, debitAccountId, creditAccountId, amount = 125.5, status = "pending" }) {
    const referenceCode = `JE-ROUTE-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const entryResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
         VALUES
            ('general', now(), 'Route test journal entry', $1, $2, $2, $3, $3, $4)
         RETURNING id`,
        [status, amount, createdByUserId, referenceCode],
    );

    const journalEntryId = entryResult.rows[0].id;

    const debitLineResult = await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 1, $2, 'debit', $3, 'Debit line', $4, $4)
         RETURNING id`,
        [journalEntryId, debitAccountId, amount, createdByUserId],
    );

    const creditLineResult = await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 2, $2, 'credit', $3, 'Credit line', $4, $4)
         RETURNING id`,
        [journalEntryId, creditAccountId, amount, createdByUserId],
    );

    return {
        journalEntryId,
        debitLineId: debitLineResult.rows[0].id,
        creditLineId: creditLineResult.rows[0].id,
    };
}

async function insertLinkedJournalDocument({ ownerUserId, journalEntryId, lineId = null, title = "Receipt", originalFileName = "receipt.pdf", fileExtension = ".pdf", fileContent = "test-document" } = {}) {
    const insertResult = await db.query(
        `INSERT INTO documents (user_id, title, original_file_name, file_extension, meta_data)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)
         RETURNING id, file_name::text AS file_name, file_extension`,
        [ownerUserId, title, originalFileName, fileExtension],
    );
    const documentRow = insertResult.rows[0];
    const storedFileName = `${documentRow.file_name}${documentRow.file_extension}`;
    const storedFilePath = path.join(userDocsRoot, storedFileName);
    fs.mkdirSync(userDocsRoot, { recursive: true });
    fs.writeFileSync(storedFilePath, Buffer.from(fileContent, "utf8"));

    await db.query(
        `INSERT INTO journal_entry_documents (journal_entry_id, document_id, created_by, updated_by)
         VALUES ($1, $2, $3, $3)`,
        [journalEntryId, documentRow.id, ownerUserId],
    );

    if (lineId) {
        await db.query(
            `INSERT INTO journal_entry_line_documents (journal_entry_line_id, document_id, created_by, updated_by)
             VALUES ($1, $2, $3, $3)`,
            [lineId, documentRow.id, ownerUserId],
        );
    }

    return {
        documentId: documentRow.id,
        storedFilePath,
    };
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

function requestRaw({ port, method, path: reqPath, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method,
                headers,
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(Buffer.from(chunk));
                });
                res.on("end", () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        bodyBuffer: Buffer.concat(chunks),
                    });
                });
            },
        );
        req.on("error", reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

function requestMultipartWithFile({ port, path: reqPath, headers = {}, fields = {}, file }) {
    const boundary = `----finledger-transactions-${Math.random().toString(16).slice(2)}`;
    const parts = [];

    Object.entries(fields).forEach(([key, value]) => {
        parts.push(Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="${key}"\r\n\r\n` + `${value}\r\n`, "utf8"));
    });

    if (file) {
        parts.push(Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\n` + `Content-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`, "utf8"));
        parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content || ""), "utf8"));
        parts.push(Buffer.from("\r\n", "utf8"));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
    const bodyBuffer = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: reqPath,
                method: "POST",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                    "Content-Length": bodyBuffer.length,
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
        req.write(bodyBuffer);
        req.end();
    });
}

test.beforeEach(async () => {
    await resetDb();
    emailCalls.length = 0;
});

test("manager can list queue, fetch details, and approve entries", async () => {
    const manager = await insertUser({ username: "manager_route_1", email: "manager_route_1@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_1", email: "acct_route_1@example.com", role: "accountant" });
    const managerToken = "manager-route-token-1";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash",
        accountNumber: 1000000101,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability",
        accountNumber: 2000000101,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 130,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const queue = await requestJson({
            port,
            method: "GET",
            path: "/api/transactions/journal-queue?status=pending&search=Route%20Cash",
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(queue.statusCode, 200);
        assert.equal(queue.body.journal_entries.length, 1);
        assert.equal(queue.body.journal_entries[0].id, seeded.journalEntryId);

        const detail = await requestJson({
            port,
            method: "GET",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(detail.statusCode, 200);
        assert.equal(detail.body.journal_entry.id, seeded.journalEntryId);
        assert.equal(detail.body.lines.length, 2);

        const approve = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/approve`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
            body: { manager_comment: "Approved by manager route test" },
        });
        assert.equal(approve.statusCode, 200);
        assert.equal(approve.body.messageCode, "MSG_JOURNAL_ENTRY_APPROVED_SUCCESS");

        assert.equal(emailCalls.length, 1);
        assert.equal(emailCalls[0].to, accountant.email);
        assert.match(emailCalls[0].subject, /Journal Entry APPROVED/i);

        const entryState = await db.query("SELECT status, posted_at FROM journal_entries WHERE id = $1", [seeded.journalEntryId]);
        assert.equal(entryState.rows[0].status, "approved");
        assert.ok(entryState.rows[0].posted_at);
    } finally {
        server.close();
    }
});

test("accountant can view queue/details but cannot approve or reject", async () => {
    const manager = await insertUser({ username: "manager_route_2", email: "manager_route_2@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_2", email: "acct_route_2@example.com", role: "accountant" });
    const accountantToken = "acct-route-token-2";
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 2",
        accountNumber: 1000000102,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 2",
        accountNumber: 2000000102,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: manager.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 150,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const queue = await requestJson({
            port,
            method: "GET",
            path: "/api/transactions/journal-queue?status=pending",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
        });
        assert.equal(queue.statusCode, 200);
        assert.equal(queue.body.journal_entries.length, 1);

        const detail = await requestJson({
            port,
            method: "GET",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}`,
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
        });
        assert.equal(detail.statusCode, 200);

        const approve = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/approve`,
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
            body: { manager_comment: "Attempted by accountant" },
        });
        assert.equal(approve.statusCode, 403);
        assert.equal(approve.body.errorCode, "ERR_FORBIDDEN_MANAGER_APPROVAL_REQUIRED");

        const reject = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/reject`,
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
            body: { manager_comment: "Attempted rejection" },
        });
        assert.equal(reject.statusCode, 403);
        assert.equal(reject.body.errorCode, "ERR_FORBIDDEN_MANAGER_APPROVAL_REQUIRED");
    } finally {
        server.close();
    }
});

test("administrator cannot access journal queue/detail or approval actions", async () => {
    const admin = await insertUser({ username: "admin_route_3", email: "admin_route_3@example.com", role: "administrator" });
    const accountant = await insertUser({ username: "acct_route_3", email: "acct_route_3@example.com", role: "accountant" });
    const adminToken = "admin-route-token-3";
    await insertLoggedInUser({ userId: admin.id, token: adminToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 3",
        accountNumber: 1000000103,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 3",
        accountNumber: 2000000103,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 88,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const queue = await requestJson({
            port,
            method: "GET",
            path: "/api/transactions/journal-queue?status=pending",
            headers: authHeaders({ userId: admin.id, token: adminToken }),
        });
        assert.equal(queue.statusCode, 403);
        assert.equal(queue.body.errorCode, "ERR_FORBIDDEN");

        const detail = await requestJson({
            port,
            method: "GET",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}`,
            headers: authHeaders({ userId: admin.id, token: adminToken }),
        });
        assert.equal(detail.statusCode, 403);
        assert.equal(detail.body.errorCode, "ERR_FORBIDDEN");

        const approve = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/approve`,
            headers: authHeaders({ userId: admin.id, token: adminToken }),
            body: { manager_comment: "Admin attempt" },
        });
        assert.equal(approve.statusCode, 403);
        assert.equal(approve.body.errorCode, "ERR_FORBIDDEN");
    } finally {
        server.close();
    }
});

test("manager rejection requires reason and succeeds when reason is provided", async () => {
    const manager = await insertUser({ username: "manager_route_4", email: "manager_route_4@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_4", email: "acct_route_4@example.com", role: "accountant" });
    const managerToken = "manager-route-token-4";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 4",
        accountNumber: 1000000104,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 4",
        accountNumber: 2000000104,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 200,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();

        const rejectWithoutReason = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/reject`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
            body: { manager_comment: "" },
        });
        assert.equal(rejectWithoutReason.statusCode, 400);
        assert.equal(rejectWithoutReason.body.errorCode, "ERR_JOURNAL_REJECTION_REASON_REQUIRED");

        const rejectWithReason = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/reject`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
            body: { manager_comment: "Rejected because support docs were unclear" },
        });
        assert.equal(rejectWithReason.statusCode, 200);
        assert.equal(rejectWithReason.body.messageCode, "MSG_JOURNAL_ENTRY_REJECTED_SUCCESS");

        assert.equal(emailCalls.length, 1);
        assert.equal(emailCalls[0].to, accountant.email);
        assert.match(emailCalls[0].subject, /Journal Entry REJECTED/i);
        assert.match(emailCalls[0].body, /Rejected because support docs were unclear/i);

        const entryState = await db.query("SELECT status, manager_comment FROM journal_entries WHERE id = $1", [seeded.journalEntryId]);
        assert.equal(entryState.rows[0].status, "rejected");
        assert.equal(entryState.rows[0].manager_comment, "Rejected because support docs were unclear");
    } finally {
        server.close();
    }
});

test("journal submission triggers manager notification email", async () => {
    const manager = await insertUser({ username: "manager_route_5", email: "manager_route_5@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_5", email: "acct_route_5@example.com", role: "accountant" });
    const accountantToken = "acct-route-token-5";
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 5",
        accountNumber: 1000000105,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 5",
        accountNumber: 2000000105,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const payload = {
        journal_type: "general",
        entry_date: "2026-03-01",
        description: "Journal submission notification test",
        reference_code: null,
        documents: [
            {
                client_document_id: "doc-1",
                title: "Evidence",
                upload_index: 0,
                meta_data: {
                    original_name: "evidence.txt",
                    file_size: 11,
                    last_modified: Date.now(),
                },
            },
        ],
        journal_entry_document_ids: ["doc-1"],
        lines: [
            {
                line_no: 1,
                account_id: debitAccount.id,
                dc: "debit",
                amount: "100.00",
                line_description: "Debit test",
                document_ids: ["doc-1"],
            },
            {
                line_no: 2,
                account_id: creditAccount.id,
                dc: "credit",
                amount: "100.00",
                line_description: "Credit test",
                document_ids: ["doc-1"],
            },
        ],
    };

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const response = await requestMultipartWithFile({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
            fields: {
                payload: JSON.stringify(payload),
            },
            file: {
                fieldName: "documents",
                fileName: "evidence.txt",
                contentType: "text/plain",
                content: "hello-world",
            },
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.messageCode, "MSG_JOURNAL_ENTRY_CREATED_SUCCESS");

        assert.equal(emailCalls.length, 1);
        assert.equal(emailCalls[0].to, manager.email);
        assert.match(emailCalls[0].subject, /Journal Entry Submitted for Approval/i);
    } finally {
        server.close();
    }
});

test("journal submission notifies administrators in addition to managers", async () => {
    const manager = await insertUser({ username: "manager_route_5b", email: "manager_route_5b@example.com", role: "manager" });
    const admin = await insertUser({ username: "admin_route_5b", email: "admin_route_5b@example.com", role: "administrator" });
    const accountant = await insertUser({ username: "acct_route_5b", email: "acct_route_5b@example.com", role: "accountant" });
    const accountantToken = "acct-route-token-5b";
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 5B",
        accountNumber: 1000001105,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 5B",
        accountNumber: 2000001105,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const payload = {
        journal_type: "general",
        entry_date: "2026-03-02",
        description: "Journal submission manager/admin notification test",
        reference_code: null,
        documents: [
            {
                client_document_id: "doc-1",
                title: "Evidence",
                upload_index: 0,
                meta_data: {
                    original_name: "evidence.txt",
                    file_size: 11,
                    last_modified: Date.now(),
                },
            },
        ],
        journal_entry_document_ids: ["doc-1"],
        lines: [
            {
                line_no: 1,
                account_id: debitAccount.id,
                dc: "debit",
                amount: "75.00",
                line_description: "Debit test",
                document_ids: ["doc-1"],
            },
            {
                line_no: 2,
                account_id: creditAccount.id,
                dc: "credit",
                amount: "75.00",
                line_description: "Credit test",
                document_ids: ["doc-1"],
            },
        ],
    };

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const response = await requestMultipartWithFile({
            port,
            path: "/api/transactions/new-journal-entry",
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
            fields: {
                payload: JSON.stringify(payload),
            },
            file: {
                fieldName: "documents",
                fileName: "evidence.txt",
                contentType: "text/plain",
                content: "hello-world",
            },
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.messageCode, "MSG_JOURNAL_ENTRY_CREATED_SUCCESS");

        const recipients = emailCalls.map((call) => call.to).sort();
        assert.deepEqual(recipients, [admin.email, manager.email].sort());
    } finally {
        server.close();
    }
});

test("ledger endpoint returns posted rows with filtering and supports administrator read access", async () => {
    const manager = await insertUser({ username: "manager_route_6", email: "manager_route_6@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_6", email: "acct_route_6@example.com", role: "accountant" });
    const admin = await insertUser({ username: "admin_route_6", email: "admin_route_6@example.com", role: "administrator" });
    const managerToken = "manager-route-token-6";
    const adminToken = "admin-route-token-6";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: admin.id, token: adminToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 6",
        accountNumber: 1000000106,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 6",
        accountNumber: 2000000106,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 220,
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const approve = await requestJson({
            port,
            method: "PATCH",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/approve`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
            body: { manager_comment: "Approved for ledger route test" },
        });
        assert.equal(approve.statusCode, 200);

        const filteredLedger = await requestJson({
            port,
            method: "GET",
            path: `/api/transactions/ledger?account_id=${debitAccount.id}&search=Route%20Cash%206`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(filteredLedger.statusCode, 200);
        assert.ok(Array.isArray(filteredLedger.body.ledger_entries));
        assert.equal(filteredLedger.body.ledger_entries.length, 1);
        assert.equal(Number(filteredLedger.body.ledger_entries[0].account_id), Number(debitAccount.id));
        assert.equal(filteredLedger.body.ledger_entries[0].account_name, "Route Cash 6");
        assert.equal(filteredLedger.body.pagination.total, 1);
        assert.ok(filteredLedger.body.ledger_entries[0].running_balance !== undefined);
        assert.ok(Array.isArray(filteredLedger.body.t_account.debit_entries));
        assert.ok(Array.isArray(filteredLedger.body.t_account.credit_entries));

        const adminLedger = await requestJson({
            port,
            method: "GET",
            path: "/api/transactions/ledger",
            headers: authHeaders({ userId: admin.id, token: adminToken }),
        });
        assert.equal(adminLedger.statusCode, 200);
        assert.ok(Array.isArray(adminLedger.body.ledger_entries));
        assert.equal(adminLedger.body.ledger_entries.length, 2);
    } finally {
        server.close();
    }
});

test("journal document download supports manager/accountant and blocks administrator", async () => {
    const manager = await insertUser({ username: "manager_route_7", email: "manager_route_7@example.com", role: "manager" });
    const accountant = await insertUser({ username: "acct_route_7", email: "acct_route_7@example.com", role: "accountant" });
    const admin = await insertUser({ username: "admin_route_7", email: "admin_route_7@example.com", role: "administrator" });
    const managerToken = "manager-route-token-7";
    const accountantToken = "acct-route-token-7";
    const adminToken = "admin-route-token-7";
    await insertLoggedInUser({ userId: manager.id, token: managerToken });
    await insertLoggedInUser({ userId: accountant.id, token: accountantToken });
    await insertLoggedInUser({ userId: admin.id, token: adminToken });

    const categories = await seedCategories();
    const debitAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Cash 7",
        accountNumber: 1000000107,
        normalSide: "debit",
        accountCategoryId: categories.assetsCategoryId,
        accountSubcategoryId: categories.assetsSubcategoryId,
        accountOrder: 10,
    });
    const creditAccount = await insertAccount({
        userId: accountant.id,
        accountName: "Route Liability 7",
        accountNumber: 2000000107,
        normalSide: "credit",
        accountCategoryId: categories.liabilitiesCategoryId,
        accountSubcategoryId: categories.liabilitiesSubcategoryId,
        accountOrder: 20,
    });

    const seeded = await seedPendingJournalEntry({
        createdByUserId: accountant.id,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: 90,
    });

    const linkedDocument = await insertLinkedJournalDocument({
        ownerUserId: accountant.id,
        journalEntryId: seeded.journalEntryId,
        lineId: seeded.debitLineId,
        title: "Downloadable Receipt",
        originalFileName: "downloadable_receipt.pdf",
        fileExtension: ".pdf",
        fileContent: "download-test-content",
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        const { port } = server.address();
        const downloadPath = `/api/transactions/journal-entry/${seeded.journalEntryId}/documents/${linkedDocument.documentId}/download`;

        const managerDownload = await requestRaw({
            port,
            method: "GET",
            path: downloadPath,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(managerDownload.statusCode, 200);
        assert.equal(managerDownload.bodyBuffer.toString("utf8"), "download-test-content");

        const accountantDownload = await requestRaw({
            port,
            method: "GET",
            path: downloadPath,
            headers: authHeaders({ userId: accountant.id, token: accountantToken }),
        });
        assert.equal(accountantDownload.statusCode, 200);
        assert.equal(accountantDownload.bodyBuffer.toString("utf8"), "download-test-content");

        const adminDownload = await requestJson({
            port,
            method: "GET",
            path: downloadPath,
            headers: authHeaders({ userId: admin.id, token: adminToken }),
        });
        assert.equal(adminDownload.statusCode, 403);
        assert.equal(adminDownload.body.errorCode, "ERR_FORBIDDEN");

        const missingDocument = await requestJson({
            port,
            method: "GET",
            path: `/api/transactions/journal-entry/${seeded.journalEntryId}/documents/${linkedDocument.documentId + 999}/download`,
            headers: authHeaders({ userId: manager.id, token: managerToken }),
        });
        assert.equal(missingDocument.statusCode, 404);
        assert.equal(missingDocument.body.errorCode, "ERR_JOURNAL_ENTRY_NOT_FOUND");
    } finally {
        server.close();
        if (fs.existsSync(linkedDocument.storedFilePath)) {
            fs.unlinkSync(linkedDocument.storedFilePath);
        }
    }
});
