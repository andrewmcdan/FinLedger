const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const db = require("../../src/db/db");

function readEnvFile(filePath) {
    const values = {};
    if (!fs.existsSync(filePath)) {
        return values;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        const splitIndex = trimmed.indexOf("=");
        if (splitIndex <= 0) {
            continue;
        }
        const key = trimmed.slice(0, splitIndex).trim();
        const value = trimmed.slice(splitIndex + 1).trim();
        values[key] = value;
    }
    return values;
}

const envFromFile = readEnvFile(path.resolve(__dirname, "../../.env.test"));
const adminUsername = process.env.ADMIN_USERNAME || envFromFile.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || envFromFile.ADMIN_PASSWORD || "password";

function sanitizeStepName(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

async function captureStepScreenshot(page, testInfo, stepName) {
    const fileName = `${sanitizeStepName(stepName)}.png`;
    const screenshotPath = testInfo.outputPath(fileName);
    await page.screenshot({
        path: screenshotPath,
        fullPage: true,
    });
    await testInfo.attach(stepName, {
        path: screenshotPath,
        contentType: "image/png",
    });
}

async function gotoLogin(page) {
    await page.goto("/#/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

async function loginAsAdmin(page) {
    await gotoLogin(page);
    await page.locator("#username").fill(adminUsername);
    await page.locator("#password").fill(adminPassword);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/#\/dashboard$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function loginViaApi(request) {
    const response = await request.post("/api/auth/login", {
        data: {
            username: adminUsername,
            password: adminPassword,
        },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    return {
        token: body.token,
        userId: String(body.user_id),
        username: body.username || adminUsername,
        fullName: body.fullName || "",
    };
}

async function authenticatePageAsAdmin(page, request) {
    const auth = await loginViaApi(request);
    await page.goto("/");
    await page.evaluate((session) => {
        localStorage.setItem("auth_token", session.token);
        localStorage.setItem("user_id", session.userId);
        localStorage.setItem("username", session.username || "");
        localStorage.setItem("full_name", session.fullName || "");
        localStorage.removeItem("must_change_password");
    }, auth);
    return auth;
}

async function createAccountViaApi(request, { token, userId }) {
    const accountName = `UI_E2E_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const response = await request.post("/api/accounts/create", {
        headers: {
            Authorization: `Bearer ${token}`,
            "X-User-Id": userId,
            "Content-Type": "application/json",
        },
        data: {
            accountName,
            accountDescription: "Account created by Playwright test",
            normalSide: "debit",
            accountCategory: "Assets",
            accountSubcategory: "Current Assets",
            balance: 0,
            initialBalance: 0,
            total_debits: 0,
            total_credits: 0,
            accountOrder: 0,
            statementType: "Balance Sheet",
            comments: "UI test comment",
            accountOwner: userId,
        },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
}

async function insertUiUser({
    username,
    email,
    role = "accountant",
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
            $1, $2, 'UI', 'User', $3, 'active',
            crypt($4, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false
        ) RETURNING id, username`,
        [username, email, role, password],
    );
    return result.rows[0];
}

async function insertUiSession({ userId, token }) {
    await db.query(
        "INSERT INTO logged_in_users (user_id, token, login_at, logout_at) VALUES ($1, $2, now(), now() + interval '2 hours')",
        [userId, token],
    );
}

async function ensureCategory(name, prefix, orderIndex) {
    const existing = await db.query("SELECT id FROM account_categories WHERE name = $1", [name]);
    if (existing.rowCount > 0) {
        return existing.rows[0].id;
    }
    const inserted = await db.query(
        `INSERT INTO account_categories (name, description, account_number_prefix, order_index)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [name, name, prefix, orderIndex],
    );
    return inserted.rows[0].id;
}

async function ensureSubcategory(categoryId, name, orderIndex) {
    const existing = await db.query("SELECT id FROM account_subcategories WHERE account_category_id = $1 AND name = $2", [categoryId, name]);
    if (existing.rowCount > 0) {
        return existing.rows[0].id;
    }
    const inserted = await db.query(
        `INSERT INTO account_subcategories (account_category_id, name, description, order_index)
         VALUES ($1, $2, $2, $3)
         RETURNING id`,
        [categoryId, name, orderIndex],
    );
    return inserted.rows[0].id;
}

async function seedTransactionsManagerFixture() {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const manager = await insertUiUser({
        username: `ui_manager_${suffix}`,
        email: `ui_manager_${suffix}@example.com`,
        role: "manager",
    });
    const accountant = await insertUiUser({
        username: `ui_accountant_${suffix}`,
        email: `ui_accountant_${suffix}@example.com`,
        role: "accountant",
    });
    const managerToken = `ui-manager-token-${suffix}`;
    await insertUiSession({ userId: manager.id, token: managerToken });

    const assetsCategoryId = await ensureCategory("Assets", "10", 10);
    const liabilitiesCategoryId = await ensureCategory("Liabilities", "20", 20);
    const assetsSubcategoryId = await ensureSubcategory(assetsCategoryId, "Current Assets", 10);
    const liabilitiesSubcategoryId = await ensureSubcategory(liabilitiesCategoryId, "Current Liabilities", 10);

    const debitAccountInsert = await db.query(
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
            $1, $2, $3, $4, 'debit',
            0, 0, 0, 0,
            10,
            'BS',
            'active',
            $5,
            $6
        ) RETURNING id`,
        [
            accountant.id,
            `UI Ledger Cash ${suffix}`,
            Number(`1${Date.now().toString().slice(-9)}`),
            "UI ledger debit account",
            assetsCategoryId,
            assetsSubcategoryId,
        ],
    );
    const creditAccountInsert = await db.query(
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
            $1, $2, $3, $4, 'credit',
            0, 0, 0, 0,
            20,
            'BS',
            'active',
            $5,
            $6
        ) RETURNING id`,
        [
            accountant.id,
            `UI Ledger Liability ${suffix}`,
            Number(`2${Date.now().toString().slice(-9)}`),
            "UI ledger credit account",
            liabilitiesCategoryId,
            liabilitiesSubcategoryId,
        ],
    );
    const debitAccountId = debitAccountInsert.rows[0].id;
    const creditAccountId = creditAccountInsert.rows[0].id;

    const pendingEntryResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
         VALUES
            ('general', now(), $1, 'pending', 120.00, 120.00, $2, $2, $3)
         RETURNING id`,
        [`UI Pending Queue Entry ${suffix}`, accountant.id, `JE-UI-PENDING-${suffix}`],
    );
    const pendingEntryId = pendingEntryResult.rows[0].id;
    await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 1, $2, 'debit', 120.00, 'UI pending debit line', $3, $3),
            ($1, 2, $4, 'credit', 120.00, 'UI pending credit line', $3, $3)`,
        [pendingEntryId, debitAccountId, accountant.id, creditAccountId],
    );

    const approvedEntryResult = await db.query(
        `INSERT INTO journal_entries
            (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, approved_by, approved_at, posted_at, reference_code)
         VALUES
            ('general', now(), $1, 'approved', 75.00, 75.00, $2, $2, $3, now(), now(), $4)
         RETURNING id`,
        [`UI Approved Ledger Entry ${suffix}`, accountant.id, manager.id, `JE-UI-APPROVED-${suffix}`],
    );
    const approvedEntryId = approvedEntryResult.rows[0].id;
    const approvedLinesResult = await db.query(
        `INSERT INTO journal_entry_lines
            (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
         VALUES
            ($1, 1, $2, 'debit', 75.00, 'UI approved debit line', $3, $3),
            ($1, 2, $4, 'credit', 75.00, 'UI approved credit line', $3, $3)
         RETURNING id, account_id, dc, amount, line_description`,
        [approvedEntryId, debitAccountId, accountant.id, creditAccountId],
    );

    for (const line of approvedLinesResult.rows) {
        await db.query(
            `INSERT INTO ledger_entries
                (account_id, entry_date, dc, amount, description, journal_entry_line_id, journal_entry_id, pr_journal_ref, created_by, updated_by, posted_at, posted_by)
             VALUES
                ($1, now(), $2, $3, $4, $5, $6, $7, $8, $8, now(), $8)`,
            [line.account_id, line.dc, line.amount, line.line_description, line.id, approvedEntryId, `JE-UI-APPROVED-${suffix}`, manager.id],
        );
    }

    return {
        manager,
        managerToken,
    };
}

async function authenticatePageWithSession(page, session) {
    await page.goto("/");
    await page.evaluate((payload) => {
        localStorage.setItem("auth_token", payload.token);
        localStorage.setItem("user_id", payload.userId);
        localStorage.setItem("username", payload.username || "");
        localStorage.setItem("full_name", payload.fullName || "");
        localStorage.removeItem("must_change_password");
    }, session);
}

test("admin can sign in from the login UI", async ({ page }, testInfo) => {
    await captureStepScreenshot(page, testInfo, "login_page_initial");
    await loginAsAdmin(page);
    await captureStepScreenshot(page, testInfo, "dashboard_after_login");
});

test("request access form shows and validates the starts-with-letter password rule", async ({ page }, testInfo) => {
    await gotoLogin(page);
    await captureStepScreenshot(page, testInfo, "login_page_before_request_access");
    await page.getByRole("button", { name: "Request Access" }).click();
    await expect(page.getByRole("heading", { name: "Request Access" })).toBeVisible();
    await captureStepScreenshot(page, testInfo, "request_access_page_loaded");

    const registerForm = page.locator("[data-register]");
    const startsWithLetterRequirement = registerForm.locator("#starts_with_letter");
    const passwordInput = registerForm.locator("#password");

    await expect(startsWithLetterRequirement).toContainText("First character must be a letter");
    await expect(startsWithLetterRequirement).toHaveClass(/invalid/);

    await passwordInput.fill("1InvalidPass!");
    await expect(startsWithLetterRequirement).toHaveClass(/invalid/);
    await captureStepScreenshot(page, testInfo, "new_user_password_invalid_start_char");

    await passwordInput.fill("ValidPass1!");
    await expect(startsWithLetterRequirement).toHaveClass(/valid/);
    await captureStepScreenshot(page, testInfo, "new_user_password_valid_start_char");
});

test("profile change-password UI shows requirements and mismatch feedback", async ({ page, request }, testInfo) => {
    await authenticatePageAsAdmin(page, request);
    await page.goto("/#/profile");
    await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible();
    await page.waitForFunction(() => document.querySelectorAll("#security_question_1 option").length > 1);
    await captureStepScreenshot(page, testInfo, "profile_page_loaded");

    const changePasswordForm = page.locator("#change-password-form");
    const requirementsPopup = changePasswordForm.locator("[data-password-requirements]");
    const matchPopup = changePasswordForm.locator("[data-password-match]");
    const startsWithLetterRequirement = changePasswordForm.locator("#starts_with_letter");

    await expect(requirementsPopup).toBeVisible();
    await expect(startsWithLetterRequirement).toContainText("First character must be a letter");

    await page.locator("#new_password").fill("ValidPass1!");
    await expect(requirementsPopup).toBeHidden();
    await captureStepScreenshot(page, testInfo, "profile_password_requirements_met");

    await expect(matchPopup).toBeVisible();
    await page.locator("#confirm_new_password").fill("DifferentPass1!");
    await expect(matchPopup).toBeVisible();
    await captureStepScreenshot(page, testInfo, "profile_passwords_mismatch");

    await page.locator("#confirm_new_password").fill("ValidPass1!");
    await expect(matchPopup).toBeHidden();
    await captureStepScreenshot(page, testInfo, "profile_passwords_match");
});

test("transactions page smoke: manager can open queue modal and see live ledger rows", async ({ page }, testInfo) => {
    const fixture = await seedTransactionsManagerFixture();
    await authenticatePageWithSession(page, {
        token: fixture.managerToken,
        userId: String(fixture.manager.id),
        username: fixture.manager.username,
        fullName: "",
    });

    await page.goto("/#/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await captureStepScreenshot(page, testInfo, "transactions_page_loaded");

    const queueViewButton = page.locator("[data-journal-queue-view-button]").first();
    await expect(queueViewButton).toBeVisible({ timeout: 15000 });
    await queueViewButton.click();
    await expect(page.locator("#journal_queue_view_modal")).toHaveClass(/is-visible/);
    await expect(page.locator("[data-journal-queue-modal-reference]")).toContainText("Reference:");
    await captureStepScreenshot(page, testInfo, "transactions_queue_modal_open");
    await page.locator("#journal_queue_modal_close_button").click();
    await expect(page.locator("#journal_queue_view_modal")).not.toHaveClass(/is-visible/);

    await expect(page.locator("[data-ledger-rows] tr").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("[data-ledger-rows]")).toContainText("UI Ledger");
    await captureStepScreenshot(page, testInfo, "transactions_ledger_live_rows");
});
