import { expect } from "@playwright/test";

export const tid = (id) => `[data-testid="${id}"]`;

export async function openApp(page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("view-title")).toBeVisible();
}

export async function addTask(page, text) {
  const input = page.getByTestId("new-task-title");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

export const taskTitles = (page) => page.getByTestId("task-title").allTextContents();

export const task = (page, title) => page.getByTestId("task-item").filter({ hasText: title });

export async function devSignIn(page, email) {
  await page.getByTestId("sync-badge").click();
  await page.getByTestId("dev-email").fill(email);
  await page.getByTestId("dev-signin").click();
  await expect(page.getByTestId("sync-badge")).toHaveText("Synced", { timeout: 20_000 });
}

export const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Reads the app's saved data straight from the browser. */
export const savedData = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lt.data.v1")));
