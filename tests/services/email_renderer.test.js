/**
 * @fileoverview Unit tests for src/services/email_renderer.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderEmail } = require("../../src/services/email_renderer");

test("renderEmail composes the base layout with optional button content", async () => {
    const html = await renderEmail("password_reset_request", {
        subject: "Review Needed",
        preheader: "Action required",
        title: "Review This Message",
        companyName: "FinLedger",
        companyAddress: "123 Main St",
        logoUrl: null,
        supportEmail: "support@example.com",
        footerNote: "Confidential",
        headerRightText: "Secure Delivery",
        firstName: "Andrew",
        expiresIn: "30 minutes",
        button: {
            url: "https://example.com/review",
            label: "Open Review",
        },
    });

    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<title>Review Needed<\/title>/);
    assert.match(html, /Review This Message/);
    assert.match(html, /Hi Andrew,/);
    assert.match(html, /Open Review/);
    assert.match(html, /https:\/\/example\.com\/review/);
    assert.match(html, /30 minutes/);
    assert.match(html, /support@example\.com/);
    assert.match(html, /Confidential/);
});

test("renderEmail omits button markup when button data is not supplied", async () => {
    const html = await renderEmail("direct_message", {
        subject: "Plain Update",
        preheader: "No action needed",
        title: "Plain Message",
        companyName: "FinLedger",
        companyAddress: "123 Main St",
        logoUrl: null,
        supportEmail: null,
        footerNote: null,
        headerRightText: null,
        firstName: "Alex",
        message: "This is an informational update.",
        senderName: "FinLedger Team",
    });

    assert.match(html, /Plain Message/);
    assert.match(html, /Hi Alex,/);
    assert.match(html, /FinLedger Team/);
    assert.match(html, /FinLedger · 123 Main St/);
    assert.doesNotMatch(html, /href="https:\/\/example\.com\/review"/);
});
