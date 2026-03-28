/**
 * @fileoverview Route-level tests for smaller public and asset routes.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const db = require("../../src/db/db");
const imagesRouter = require("../../src/routes/images");
const userDocsRouter = require("../../src/routes/user_docs");
const messageCatalog = require("../../src/services/message_catalog");

const messagesRouterPath = require.resolve("../../src/routes/messages");
const userIconsDir = path.resolve(__dirname, "../../user-icons");
const defaultIconPath = path.resolve(__dirname, "../../web/public_images/default.png");

const tempIconPaths = new Set();

function loadMessagesRouter() {
    delete require.cache[messagesRouterPath];
    return require(messagesRouterPath);
}

function createApp({ router, basePath, user = null }) {
    const app = express();
    app.use(express.json());
    if (user !== null) {
        app.use((req, res, next) => {
            req.user = typeof user === "function" ? user(req) : user;
            next();
        });
    }
    app.use(basePath, router);
    return app;
}

async function request({ app, method, path: reqPath, headers = {}, body = null }) {
    const payload = body === null ? null : JSON.stringify(body);
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port: server.address().port,
                path: reqPath,
                method,
                headers: {
                    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                    ...headers,
                },
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(Buffer.from(chunk));
                });
                res.on("end", () => {
                    const rawBody = Buffer.concat(chunks);
                    const text = rawBody.toString("utf8");
                    let parsed = null;
                    try {
                        parsed = JSON.parse(text);
                    } catch {
                        parsed = null;
                    }
                    server.close(() => {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            rawBody,
                            text,
                            body: parsed,
                        });
                    });
                });
            },
        );

        req.on("error", (error) => {
            server.close(() => reject(error));
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function resetDb() {
    await db.query("TRUNCATE TABLE password_history, password_expiry_email_tracking, logged_in_users, documents, audit_logs, app_logs, accounts, users RESTART IDENTITY CASCADE");
}

async function insertUser({
    username = "route-user",
    email = "route-user@example.com",
    firstName = "Route",
    lastName = "User",
    role = "accountant",
    status = "active",
    password = "ValidPass1!",
    userIconPath = null,
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
            temp_password,
            user_icon_path
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            crypt($7, gen_salt('bf')),
            now(),
            now() + interval '90 days',
            false,
            $8
        ) RETURNING id, user_icon_path`,
        [username, email, firstName, lastName, role, status, password, userIconPath],
    );
    return result.rows[0];
}

function writeTempIcon(fileName, contents) {
    const filePath = path.join(userIconsDir, fileName);
    fs.writeFileSync(filePath, contents);
    tempIconPaths.add(filePath);
    return fileName;
}

test.beforeEach(async () => {
    await resetDb();
    messageCatalog.clearCatalogCache();
    await db.query("DELETE FROM app_messages WHERE code LIKE 'TEST_%'");
});

test.afterEach(() => {
    messageCatalog.clearCatalogCache();
    for (const filePath of tempIconPaths) {
        fs.rmSync(filePath, { force: true });
    }
    tempIconPaths.clear();
});

test("messages routes validate input and return catalog lookups", async () => {
    await db.query(
        `INSERT INTO app_messages (code, message_text, category, is_active)
         VALUES ($1, $2, 'success', TRUE)
         ON CONFLICT (code) DO UPDATE SET message_text = EXCLUDED.message_text, category = EXCLUDED.category, is_active = EXCLUDED.is_active`,
        ["TEST_HELLO_ROUTE", "Hello {{name}}"],
    );
    messageCatalog.clearCatalogCache();

    const app = createApp({ router: loadMessagesRouter(), basePath: "/api/messages" });

    const missingCodes = await request({
        app,
        method: "GET",
        path: "/api/messages",
    });
    assert.equal(missingCodes.statusCode, 400);
    assert.equal(missingCodes.body.errorCode, "ERR_INVALID_SELECTION");

    const collection = await request({
        app,
        method: "GET",
        path: "/api/messages?codes=TEST_HELLO_ROUTE,ERR_UNKNOWN,TEST_HELLO_ROUTE",
    });
    assert.equal(collection.statusCode, 200);
    assert.deepEqual(Object.keys(collection.body.messages).sort(), ["ERR_UNKNOWN", "TEST_HELLO_ROUTE"]);
    assert.equal(collection.body.messages.TEST_HELLO_ROUTE, "Hello {{name}}");
    assert.equal(collection.body.messages.ERR_UNKNOWN, "An unknown error occurred.");

    const single = await request({
        app,
        method: "GET",
        path: "/api/messages/TEST_HELLO_ROUTE?name=Andrew",
    });
    assert.equal(single.statusCode, 200);
    assert.equal(single.body.code, "TEST_HELLO_ROUTE");
    assert.equal(single.body.message, "Hello Andrew");
});

test("messages routes return internal errors when catalog lookups fail", async () => {
    const originalGetMessageByCode = messageCatalog.getMessageByCode;
    const originalGetMessagesByCodes = messageCatalog.getMessagesByCodes;

    messageCatalog.getMessageByCode = async () => {
        throw new Error("single lookup failed");
    };
    messageCatalog.getMessagesByCodes = async () => {
        throw new Error("collection lookup failed");
    };

    try {
        const app = createApp({ router: loadMessagesRouter(), basePath: "/api/messages" });

        const collection = await request({
            app,
            method: "GET",
            path: "/api/messages?codes=ERR_UNKNOWN",
        });
        assert.equal(collection.statusCode, 500);
        assert.equal(collection.body.errorCode, "ERR_INTERNAL_SERVER");

        const single = await request({
            app,
            method: "GET",
            path: "/api/messages/ERR_UNKNOWN",
        });
        assert.equal(single.statusCode, 500);
        assert.equal(single.body.errorCode, "ERR_INTERNAL_SERVER");
    } finally {
        messageCatalog.getMessageByCode = originalGetMessageByCode;
        messageCatalog.getMessagesByCodes = originalGetMessagesByCodes;
        messageCatalog.clearCatalogCache();
    }
});

test("images route returns the default icon when no user is present", async () => {
    const response = await request({
        app: createApp({ router: imagesRouter, basePath: "/images" }),
        method: "GET",
        path: "/images/user-icon.png",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"], /image\/png/);
    assert.deepEqual(response.rawBody, fs.readFileSync(defaultIconPath));
});

test("images route serves the stored user icon and falls back when the file is missing", async () => {
    const customIconBuffer = Buffer.from("custom-route-icon");
    const customIconName = writeTempIcon("11111111-1111-1111-1111-111111111111", customIconBuffer);
    const existingUser = await insertUser({
        username: "icon-existing",
        email: "icon-existing@example.com",
        userIconPath: customIconName,
    });
    const missingUser = await insertUser({
        username: "icon-missing",
        email: "icon-missing@example.com",
        userIconPath: "22222222-2222-2222-2222-222222222222",
    });

    const existingResponse = await request({
        app: createApp({ router: imagesRouter, basePath: "/images", user: { id: existingUser.id } }),
        method: "GET",
        path: "/images/user-icon.png",
    });
    assert.equal(existingResponse.statusCode, 200);
    assert.deepEqual(existingResponse.rawBody, customIconBuffer);

    const missingResponse = await request({
        app: createApp({ router: imagesRouter, basePath: "/images", user: { id: missingUser.id } }),
        method: "GET",
        path: "/images/user-icon.png",
    });
    assert.equal(missingResponse.statusCode, 200);
    assert.match(missingResponse.headers["content-type"], /image\/png/);
    assert.deepEqual(missingResponse.rawBody, fs.readFileSync(defaultIconPath));
});

test("user docs routes return placeholder responses", async () => {
    const app = createApp({ router: userDocsRouter, basePath: "/api/documents", user: { id: 123 } });

    const getResponse = await request({
        app,
        method: "GET",
        path: "/api/documents/example.pdf",
    });
    assert.equal(getResponse.statusCode, 200);
    assert.match(getResponse.text, /Document retrieval not yet implemented/);

    const postResponse = await request({
        app,
        method: "POST",
        path: "/api/documents/upload",
        body: { title: "Placeholder" },
    });
    assert.equal(postResponse.statusCode, 200);
    assert.match(postResponse.text, /Document upload not yet implemented/);
});
