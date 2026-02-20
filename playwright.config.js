const { defineConfig, devices } = require("@playwright/test");

const testPort = process.env.TEST_PORT || 3050;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${testPort}`;

module.exports = defineConfig({
    testDir: "./tests/ui",
    timeout: 30 * 1000,
    reporter: [
        ["list"],
        ["html", { open: "never" }],
    ],
    expect: {
        timeout: 5 * 1000,
    },
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "npm run db-init:test && node --env-file=.env.test src/server.js",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
