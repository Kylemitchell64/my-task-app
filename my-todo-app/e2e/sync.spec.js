import { expect, test } from "@playwright/test";
import { addTask, devSignIn, openApp, savedData, task, uniqueEmail } from "./helpers.js";

// These run against the real API and a real PostgreSQL database.

async function newDevice(browser) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await openApp(page);
  return page;
}

/** Asks the app to sync right now, the way returning to the tab does. */
async function syncNow(page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("tasks made before signing in are backed up and appear on a second device", async ({ page, browser }) => {
  const email = uniqueEmail();
  await openApp(page);
  await addTask(page, "Made as a guest 30m #React tomorrow");

  await devSignIn(page, email);
  await expect(page.getByTestId("toast").filter({ hasText: "Signed in" })).toBeVisible();
  await expect(page.getByTestId("task-title")).toHaveText(["Made as a guest"]);

  const phone = await newDevice(browser);
  await devSignIn(phone, email);
  const row = task(phone, "Made as a guest");
  await expect(row.getByTestId("task-category")).toHaveText("React");
  await expect(row.getByTestId("task-due")).toHaveText("Tomorrow");
});

test("changes travel in both directions", async ({ page, browser }) => {
  const email = uniqueEmail();
  await openApp(page);
  await devSignIn(page, email);
  const phone = await newDevice(browser);
  await devSignIn(phone, email);

  await addTask(page, "From the laptop");
  await addTask(phone, "From the phone");
  await expect(phone.getByTestId("sync-badge")).toHaveText("Synced");
  await expect(async () => {
    await syncNow(page);
    await syncNow(phone);
    await expect(page.getByTestId("task-item")).toHaveCount(2, { timeout: 1000 });
    await expect(phone.getByTestId("task-item")).toHaveCount(2, { timeout: 1000 });
  }).toPass();

  // Complete on one, delete on the other.
  await task(page, "From the phone").getByTestId("task-complete-checkbox").click();
  await task(phone, "From the laptop").getByTestId("task-open").click();
  await phone.getByTestId("delete-button").click();

  await expect(async () => {
    await syncNow(page);
    await syncNow(phone);
    await expect(page.getByTestId("task-item")).toHaveCount(0, { timeout: 1000 });
    await expect(phone.getByTestId("task-item")).toHaveCount(0, { timeout: 1000 });
  }).toPass();

  await phone.getByTestId("tab-done").or(phone.getByTestId("nav-done")).click();
  await expect(phone.getByTestId("task-title")).toHaveText(["From the phone"]);
});

test("signing out clears the device, and signing back in restores everything", async ({ page }) => {
  const email = uniqueEmail();
  await openApp(page);
  await addTask(page, "Safe in the account");
  await devSignIn(page, email);

  await page.getByTestId("open-settings").click();
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("sync-badge")).toHaveText("Sign in to sync");
  await expect(page.getByTestId("task-item")).toHaveCount(0);
  expect((await savedData(page)).tasks).toEqual({});
  expect(await page.evaluate(() => localStorage.getItem("lt.auth.v1"))).toBeNull();

  await devSignIn(page, email);
  await expect(page.getByTestId("task-title")).toHaveText(["Safe in the account"]);
});

test("the session survives a reload and keeps syncing", async ({ page, browser }) => {
  const email = uniqueEmail();
  await openApp(page);
  await devSignIn(page, email);

  await page.reload();
  await expect(page.getByTestId("sync-badge")).toHaveText("Synced");
  await addTask(page, "After the reload");
  await expect(page.getByTestId("sync-badge")).toHaveText("Synced");

  const other = await newDevice(browser);
  await devSignIn(other, email);
  await expect(other.getByTestId("task-title")).toHaveText(["After the reload"]);
});

test("the app stays fully usable when the sync server is unreachable", async ({ page }) => {
  const email = uniqueEmail();
  await openApp(page);
  await devSignIn(page, email);

  // The server "goes to sleep": every request to it fails.
  await page.route("http://localhost:8080/**", (route) => route.abort("connectionrefused"));
  await addTask(page, "Written while the server was down");
  await expect(page.getByTestId("task-title")).toHaveText(["Written while the server was down"]);
  await expect(page.getByTestId("sync-badge")).toHaveText("Offline", { timeout: 15_000 });

  // It comes back, and the waiting change goes up without the user doing anything special.
  await page.unroute("http://localhost:8080/**");
  await expect(async () => {
    await syncNow(page);
    await expect(page.getByTestId("sync-badge")).toHaveText("Synced", { timeout: 1000 });
  }).toPass();
  expect((await savedData(page)).meta.dirtyTasks).toEqual({});
});

test("an expired session asks for a new sign-in and loses nothing", async ({ page }) => {
  const email = uniqueEmail();
  await openApp(page);
  await devSignIn(page, email);

  // Corrupt both tokens, as if the session had been revoked on the server.
  await page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem("lt.auth.v1"));
    localStorage.setItem("lt.auth.v1", JSON.stringify({ ...auth, accessToken: "x.y.z", refreshToken: "revoked" }));
  });
  await page.reload();
  await addTask(page, "Made while signed out");

  await expect(page.getByTestId("sync-badge")).toHaveText("Sign in again", { timeout: 15_000 });
  await expect(page.getByTestId("task-title")).toHaveText(["Made while signed out"]);

  await devSignIn(page, email);
  await expect(page.getByTestId("task-title")).toHaveText(["Made while signed out"]);
  expect((await savedData(page)).meta.dirtyTasks).toEqual({});
});

test("deleting the account removes it from the server and the device", async ({ page }) => {
  const email = uniqueEmail();
  await openApp(page);
  await addTask(page, "Soon to be gone");
  await devSignIn(page, email);

  await page.getByTestId("open-settings").click();
  await page.getByTestId("delete-account").click();
  await page.getByTestId("confirm-delete-account").click();

  await expect(page.getByTestId("toast").filter({ hasText: "have been deleted" })).toBeVisible();
  await expect(page.getByTestId("task-item")).toHaveCount(0);

  // Signing in with the same email is a brand new, empty account.
  await devSignIn(page, email);
  await expect(page.getByTestId("task-item")).toHaveCount(0);
});

test.describe("returning from the sign-in provider", () => {
  test("an error is explained and the address is cleaned up", async ({ page }) => {
    await page.goto("/auth/callback#error=oauth_failed");
    await expect(page.getByTestId("toast")).toContainText("cancelled or did not finish");
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("view-title")).toBeVisible();
  });

  test("a used or made-up code is refused and never left in the address bar", async ({ page }) => {
    await page.goto("/auth/callback#code=not-a-real-code");
    await expect(page.getByTestId("toast").filter({ hasText: "expired" })).toBeVisible();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("sync-badge")).toHaveText("Sign in to sync");
  });
});
