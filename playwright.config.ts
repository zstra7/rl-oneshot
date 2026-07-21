import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/unit/**"],

  fullyParallel: false,

  retries: process.env["CI"] ? 2 : 0,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] ?? undefined
    }
  },

  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000
    },
    {
      command: "npm run preview",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000
    }
  ],

  projects: [
    {
      name: "chromium-dev",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173"
      }
    },

    {
      name: "chromium-preview",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173"
      }
    }
  ]
});
