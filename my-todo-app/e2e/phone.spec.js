import { expect, test } from "@playwright/test";
import { addTask, openApp } from "./helpers.js";

test("the phone layout has a tab bar and everything fits the screen", async ({ page }) => {
  await openApp(page);
  await addTask(page, "A task with a deliberately long title to check that nothing overflows the screen width 45m #LongCategoryName tomorrow !high");

  await expect(page.getByTestId("tab-today")).toBeVisible();
  await expect(page.getByTestId("nav-today")).toHaveCount(0);

  // Nothing makes the page scroll sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByTestId("task-open").tap();
  await expect(page.getByTestId("task-editor")).toBeVisible();
  const overflowOpen = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowOpen).toBeLessThanOrEqual(0);

  await page.getByTestId("tab-progress").tap();
  await expect(page.getByTestId("view-title")).toHaveText("Progress");
});

test("tap targets are big enough for a thumb", async ({ page }) => {
  await openApp(page);
  await addTask(page, "Tap me");
  for (const testId of ["task-complete-checkbox", "task-focus", "tab-today", "create-button"]) {
    const box = await page.getByTestId(testId).first().boundingBox();
    expect(Math.min(box.width, box.height), testId).toBeGreaterThanOrEqual(34);
  }
});
