const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const db = require("../../src/db/db");
const { cleanupUserData } = require("../../src/utils/utilities");

const userDocsDir = path.resolve(__dirname, "../../user-docs");
const userIconsDir = path.resolve(__dirname, "../../user-icons");

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

async function insertUser({ username, email, role = "accountant" } = {}) {
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
            $1, $2, 'Test', 'User', $3, 'active',
            crypt('ValidPass1!', gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false
        ) RETURNING id`,
        [username, email, role],
    );
    return result.rows[0];
}

test.beforeEach(async () => {
    await resetDb();
    fs.mkdirSync(userDocsDir, { recursive: true });
    fs.mkdirSync(userIconsDir, { recursive: true });
    for (const file of fs.readdirSync(userDocsDir)) {
        fs.unlinkSync(path.join(userDocsDir, file));
    }
});

test("cleanupUserData preserves referenced document files with extension and removes orphan files", async () => {
    const user = await insertUser({
        username: "utility_cleanup_user_1",
        email: "utility_cleanup_user_1@example.com",
    });

    const docResult = await db.query(
        `INSERT INTO documents (user_id, title, original_file_name, file_extension, meta_data)
         VALUES ($1, 'Cleanup Doc', 'cleanup_doc.pdf', '.pdf', '{}'::jsonb)
         RETURNING file_name::text AS file_name, file_extension`,
        [user.id],
    );

    const storedDocName = `${docResult.rows[0].file_name}${docResult.rows[0].file_extension}`;
    const referencedDocPath = path.join(userDocsDir, storedDocName);
    const orphanDocPath = path.join(userDocsDir, "orphan-file.pdf");
    fs.writeFileSync(referencedDocPath, "keep-me");
    fs.writeFileSync(orphanDocPath, "remove-me");

    await cleanupUserData();

    assert.equal(fs.existsSync(referencedDocPath), true);
    assert.equal(fs.existsSync(orphanDocPath), false);
});
