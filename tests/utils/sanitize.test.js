/**
 * @fileoverview Unit tests for sanitizeInput and generateRandomToken in src/utils/utilities.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeInput, generateRandomToken } = require("../../src/utils/utilities");

// ---- sanitizeInput ----

test("sanitizeInput escapes < > & \" ' ` characters", () => {
    assert.equal(sanitizeInput("<"), "&lt;");
    assert.equal(sanitizeInput(">"), "&gt;");
    assert.equal(sanitizeInput("&"), "&amp;");
    assert.equal(sanitizeInput('"'), "&quot;");
    assert.equal(sanitizeInput("'"), "&#x27;");
    assert.equal(sanitizeInput("`"), "&#x60;");
});

test("sanitizeInput escapes a full XSS payload string", () => {
    const input = `<script>alert("xss")</script>`;
    const result = sanitizeInput(input);
    assert.ok(!result.includes("<"), "result should not contain <");
    assert.ok(!result.includes(">"), "result should not contain >");
    assert.ok(!result.includes('"'), 'result should not contain "');
    assert.match(result, /&lt;script&gt;/);
    assert.match(result, /&lt;\/script&gt;/);
});

test("sanitizeInput removes dollar signs and dots", () => {
    // $ and . are stripped by the final replace(/[$.]/g, "")
    assert.equal(sanitizeInput("$100.00"), "10000"); // $ removed, both dots removed
    assert.equal(sanitizeInput("a.b$c"), "abc");
    assert.equal(sanitizeInput("..."), "");
    assert.equal(sanitizeInput("$$$"), "");
});

test("sanitizeInput passes non-string values through unchanged", () => {
    assert.equal(sanitizeInput(42), 42);
    assert.equal(sanitizeInput(0), 0);
    assert.equal(sanitizeInput(null), null);
    assert.equal(sanitizeInput(undefined), undefined);
    assert.equal(sanitizeInput(true), true);
    const obj = { key: "<script>" };
    assert.equal(sanitizeInput(obj), obj);
    const arr = [1, 2, 3];
    assert.equal(sanitizeInput(arr), arr);
});

test("sanitizeInput returns empty string unchanged", () => {
    assert.equal(sanitizeInput(""), "");
});

test("sanitizeInput leaves clean alphanumeric strings unchanged", () => {
    assert.equal(sanitizeInput("hello world"), "hello world");
    assert.equal(sanitizeInput("abc123"), "abc123");
});

// ---- generateRandomToken ----

test("generateRandomToken returns a non-empty string", () => {
    const token = generateRandomToken();
    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);
});

test("generateRandomToken output is base64url-safe (no +, /, or = characters)", () => {
    for (let i = 0; i < 10; i += 1) {
        const token = generateRandomToken(32);
        assert.match(token, /^[A-Za-z0-9_-]+$/, `Token contained non-base64url chars: ${token}`);
    }
});

test("generateRandomToken produces longer output for larger byte length inputs", () => {
    const short = generateRandomToken(8);
    const medium = generateRandomToken(32);
    const long = generateRandomToken(64);
    assert.ok(medium.length > short.length, "medium should be longer than short");
    assert.ok(long.length > medium.length, "long should be longer than medium");
});

test("generateRandomToken produces unique values on repeated calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateRandomToken()));
    assert.equal(tokens.size, 20, "all 20 tokens should be unique");
});
