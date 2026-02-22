const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

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
