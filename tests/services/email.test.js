/**
 * @fileoverview Tests for SMTP config and email send behavior.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const emailModulePath = path.resolve(__dirname, "../../src/services/email.js");

const ENV_KEYS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_REQUIRE_TLS",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_EMAIL_FROM",
    "EMAIL_COMPANY_NAME",
    "EMAIL_COMPANY_ADDRESS",
    "EMAIL_HEADER_RIGHT_TEXT",
    "SUPPORT_EMAIL",
    "EMAIL_LOGO_URL",
    "EMAIL_LOGO_PATH",
    "EMAIL_LOGO_CID",
    "EMAIL_EMBED_LOGO",
    "FRONTEND_BASE_URL",
];

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
    for (const key of ENV_KEYS) {
        const originalValue = originalEnv.get(key);
        if (originalValue === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalValue;
        }
    }
}

function loadEmailModule(overrides = {}) {
    restoreEnv();
    Object.assign(process.env, overrides);
    delete require.cache[emailModulePath];
    return require(emailModulePath);
}

test.afterEach(() => {
    restoreEnv();
    delete require.cache[emailModulePath];
});

test("buildSmtpTransportOptions infers secure mode from the SMTP port", () => {
    let email = loadEmailModule({
        SMTP_HOST: "email-smtp.us-east-1.amazonaws.com",
        SMTP_PORT: "465",
        SMTP_USERNAME: "smtp-user",
        SMTP_PASSWORD: "smtp-pass",
    });

    let transport = email.buildSmtpTransportOptions();
    assert.equal(transport.host, "email-smtp.us-east-1.amazonaws.com");
    assert.equal(transport.port, 465);
    assert.equal(transport.secure, true);
    assert.equal(transport.requireTLS, false);

    email = loadEmailModule({
        SMTP_HOST: "email-smtp.us-east-1.amazonaws.com",
        SMTP_PORT: "587",
        SMTP_USERNAME: "smtp-user",
        SMTP_PASSWORD: "smtp-pass",
    });

    transport = email.buildSmtpTransportOptions();
    assert.equal(transport.port, 587);
    assert.equal(transport.secure, false);
    assert.equal(transport.requireTLS, false);
});

test("buildSmtpTransportOptions respects explicit security overrides", () => {
    const email = loadEmailModule({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "false",
        SMTP_REQUIRE_TLS: "true",
        SMTP_USERNAME: "smtp-user",
        SMTP_PASSWORD: "smtp-pass",
    });

    const transport = email.buildSmtpTransportOptions();
    assert.equal(transport.port, 465);
    assert.equal(transport.secure, false);
    assert.equal(transport.requireTLS, true);
});

test("sendEmail passes html/text/attachments to the configured transporter", async () => {
    const email = loadEmailModule({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_EMAIL_FROM: "noreply@example.com",
        EMAIL_COMPANY_NAME: "FinLedger",
    });

    let captured = null;
    email.__setTransporterForTests({
        sendMail: async (options) => {
            captured = options;
            return { messageId: "message-1" };
        },
    });

    const result = await email.sendEmail(
        "user@example.com",
        "HTML Subject",
        "<!doctype html><html><body><strong>Hello</strong></body></html>",
        "Plain fallback",
        { attachments: [{ filename: "sample.txt", content: "hello" }] },
    );

    assert.equal(result.messageId, "message-1");
    assert.ok(captured);
    assert.equal(captured.from, "FinLedger <noreply@example.com>");
    assert.equal(captured.to, "user@example.com");
    assert.equal(captured.subject, "HTML Subject");
    assert.match(captured.html, /<strong>Hello<\/strong>/);
    assert.equal(captured.text, "Plain fallback");
    assert.equal(captured.attachments.length, 1);
    assert.equal(captured.attachments[0].filename, "sample.txt");
});

test("sendTemplatedEmail renders html and embeds the configured logo attachment once", async () => {
    const email = loadEmailModule({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_EMAIL_FROM: "noreply@example.com",
        EMAIL_COMPANY_NAME: "FinLedger",
        EMAIL_EMBED_LOGO: "true",
        EMAIL_LOGO_CID: "finledger-logo@test",
        FRONTEND_BASE_URL: "https://app.finledger.example",
    });

    let captured = null;
    email.__setTransporterForTests({
        sendMail: async (options) => {
            captured = options;
            return { messageId: "message-2" };
        },
    });

    const result = await email.sendTemplatedEmail({
        to: "user@example.com",
        subject: "Reset Password",
        templateName: "password_reset_request",
        text: "Plain reset text",
        templateData: {
            firstName: "Andrew",
            expiresIn: "30 minutes",
            title: "Password Reset",
            logoUrl: "",
        },
        attachments: [{ filename: "existing.txt", content: "x" }],
    });

    assert.equal(result.messageId, "message-2");
    assert.ok(captured);
    assert.match(captured.html, /Password Reset/);
    assert.match(captured.html, /cid:finledger-logo@test/);
    assert.equal(captured.text, "Plain reset text");
    assert.equal(captured.attachments.length, 2);
    assert.equal(captured.attachments[0].filename, "existing.txt");
    assert.equal(captured.attachments[1].cid, "finledger-logo@test");
});
