import { defineConfig, devices } from "@playwright/test";

const API_URL = "http://localhost:8080";
const database =
  process.env.E2E_DATABASE ?? "Host=localhost;Port=5432;Database=tasks_e2e;Username=postgres;Password=postgres";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // Each test starts as a brand new visitor. The service worker is switched off
    // except in the test that is about working offline.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.js/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /phone\.spec\.js/ },
  ],
  webServer: [
    {
      // The real API with its real database, so sync is tested end to end.
      command: "dotnet run --project ../TodoApi --no-launch-profile",
      url: `${API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ASPNETCORE_ENVIRONMENT: "Development",
        ASPNETCORE_URLS: API_URL,
        ConnectionStrings__DefaultConnection: database,
        FRONTEND_URL: "http://localhost:4173",
        RateLimits__ApiPerMinute: "100000",
        RateLimits__AuthPerMinute: "100000",
      },
    },
    {
      command: "npm run build && npm run preview",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
