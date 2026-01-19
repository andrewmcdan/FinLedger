/**
 * @fileoverview Tests for the server.js file.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../src/server");

function request(path, port) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path,
                method: "GET",
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    resolve({ statusCode: res.statusCode, body: data });
                });
            },
        );

        req.on("error", reject);
        req.end();
    });
}

test("server responds to GET /", async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    try {
        // Get the port the server is listening on
        const { port } = server.address();
        const response = await request("/", port);

        assert.equal(response.statusCode, 200);
        assert.match(response.body, /FinLedger/);
    } finally {
        server.close();
    }
});
