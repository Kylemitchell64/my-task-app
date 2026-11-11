import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addTask, openApp, savedData, task, taskTitles } from "./helpers.js";

test.describe("first visit", () => {
  test("opens straight into the app with no sign-in wall", async ({ page }) => {
    await openApp(page);

    await expect(page.getByTestId("view-title")).toHaveText("All tasks");
    await expect(page.getByTestId("empty-state")).toContainText("What do you want to learn?");
    await expect(page.getByTestId("new-task-title")).toBeVisible();
    await expect(page.getByTestId("sync-badge")).toHaveText("Sign in to sync");
  });

  test("a task added as a guest is still there after a reload", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Learn about closures");
    await expect(page.getByTestId("task-title")).toHaveText(["Learn about closures"]);

    await page.reload();
    await expect(page.getByTestId("task-title")).toHaveText(["Learn about closures"]);
  });

  test("the sample tasks give a new visitor something to try", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("add-samples").click();
    await expect(page.getByTestId("task-item")).toHaveCount(4);
    await expect(page.getByTestId("nav-today")).toContainText("2");
  });

  test("the theme is applied before the page paints", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("lt.prefs.v1", JSON.stringify({ theme: "dark" })));
    await page.goto("/");
    // Set by the tiny script in <head>, before React has loaded.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("quick add", () => {
  test("understands time, category, date and priority typed in one line", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("new-task-title").fill("Read EF Core docs 45m #csharp tomorrow !high");

    await expect(page.getByTestId("token-estimate")).toHaveText("45 min");
    await expect(page.getByTestId("token-category")).toHaveText("#csharp");
    await expect(page.getByTestId("token-due")).toHaveText("Tomorrow");
    await expect(page.getByTestId("token-priority")).toHaveText("High priority");

    await page.getByTestId("new-task-title").press("Enter");

    const row = task(page, "Read EF Core docs");
    await expect(row.getByTestId("task-title")).toHaveText("Read EF Core docs");
    await expect(row.getByTestId("task-due")).toHaveText("Tomorrow");
    await expect(row.getByTestId("task-category")).toHaveText("csharp");
    await expect(row.getByTestId("task-time")).toHaveText("45m");
  });

  test("a wrongly guessed token can be turned back into plain text", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("new-task-title").fill("Write the daily standup notes");
    await expect(page.getByTestId("token-repeat")).toBeVisible();

    await page.getByTestId("token-repeat").getByRole("button").click();
    await expect(page.getByTestId("token-repeat")).toHaveCount(0);
    await expect(page.getByTestId("new-task-title")).toBeFocused();

    await page.getByTestId("new-task-title").press("Enter");
    await expect(page.getByTestId("task-title")).toHaveText(["Write the daily standup notes"]);
  });

  test("does not add an empty task", async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId("create-button")).toBeDisabled();
    await page.getByTestId("new-task-title").fill("   ");
    await page.getByTestId("new-task-title").press("Enter");
    await expect(page.getByTestId("task-item")).toHaveCount(0);
  });

  test("a task added from Today is due today", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("nav-today").click();
    await addTask(page, "Morning review");
    await expect(task(page, "Morning review").getByTestId("task-due")).toHaveText("Today");
  });

  test("says where a task went when it is not in the current view", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("nav-today").click();
    await addTask(page, "Plan the week friday");

    await expect(page.getByTestId("task-item")).toHaveCount(0);
    const toast = page.getByTestId("toast").filter({ hasText: "Added to" });
    await toast.getByRole("button", { name: "Show" }).click();
    await expect(page.getByTestId("view-title")).toHaveText("Upcoming");
    await expect(page.getByTestId("task-title")).toHaveText(["Plan the week"]);
  });

  test("shows text exactly as typed and never runs it", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (dialog) => {
      dialogs++;
      dialog.dismiss();
    });
    await openApp(page);
    const payload = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    await addTask(page, payload);

    await expect(page.getByTestId("task-title")).toHaveText([payload]);
    await expect(page.locator("main img")).toHaveCount(0);
    expect(dialogs).toBe(0);
  });
});

test.describe("working with tasks", () => {
  test("completing a task moves it to Done, and undo brings it back", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Finish me");
    await page.getByTestId("task-complete-checkbox").click();

    await expect(page.getByTestId("task-item")).toHaveCount(0);
    await page.getByTestId("nav-done").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Finish me"]);

    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await page.getByTestId("nav-all").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Finish me"]);
  });

  test("a finished task can be reopened from Done", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Round trip");
    await page.getByTestId("task-complete-checkbox").click();
    await page.getByTestId("nav-done").click();
    await expect(page.getByTestId("task-complete-checkbox")).toHaveAttribute("aria-checked", "true");

    await page.getByTestId("task-complete-checkbox").click();
    await page.getByTestId("nav-all").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Round trip"]);
  });

  test("editing saves every field and survives a reload", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Draft title");
    await page.getByTestId("task-open").click();

    await page.getByTestId("edit-title").fill("Final title");
    await page.getByTestId("edit-notes").fill("Some notes\nwith two lines");
    await page.getByTestId("edit-due").fill("2031-03-14");
    await page.getByRole("radio", { name: "High" }).click();
    await page.getByTestId("edit-estimate").fill("90");
    await page.getByTestId("edit-category").fill("Databases");
    await page.getByTestId("edit-repeat").selectOption("weekly");
    await page.getByTestId("editor-close").click();

    await page.reload();
    const data = await savedData(page);
    expect(Object.values(data.tasks)[0]).toMatchObject({
      title: "Final title",
      description: "Some notes\nwith two lines",
      dueDate: "2031-03-14",
      priority: 3,
      estimatedMinutes: 90,
      category: "Databases",
      repeat: "weekly",
    });
    await expect(task(page, "Final title").getByTestId("task-category")).toHaveText("Databases");
  });

  test("a title cannot be saved empty", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Keep me");
    await page.getByTestId("task-open").click();
    await page.getByTestId("edit-title").fill("");
    await page.getByTestId("editor-close").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Keep me"]);
  });

  test("deleting can be undone", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Delete me");
    await page.getByTestId("task-open").click();
    await page.getByTestId("delete-button").click();
    await expect(page.getByTestId("task-item")).toHaveCount(0);

    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("task-title")).toHaveText(["Delete me"]);
  });

  test("finishing a repeating task schedules the next one", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Review notes daily");
    await expect(task(page, "Review notes").getByTestId("task-due")).toHaveText("Today");

    await page.getByTestId("task-complete-checkbox").click();

    await expect(page.getByTestId("toast")).toContainText("Next one is due tomorrow");
    await expect(task(page, "Review notes").getByTestId("task-due")).toHaveText("Tomorrow");
    await page.getByTestId("nav-done").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Review notes"]);
  });

  test("tasks can be reordered with the keyboard", async ({ page }) => {
    await openApp(page);
    await addTask(page, "third");
    await addTask(page, "second");
    await addTask(page, "first");
    expect(await taskTitles(page)).toEqual(["first", "second", "third"]);

    await page.getByRole("button", { name: "Reorder first" }).focus();
    // The list re-measures after each key, so give it a beat like a person would.
    for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }

    await expect(page.getByTestId("task-title")).toHaveText(["second", "third", "first"]);
    await page.reload();
    await expect(page.getByTestId("task-title")).toHaveText(["second", "third", "first"]);
  });

  test("tasks can be reordered by dragging", async ({ page }) => {
    await openApp(page);
    await addTask(page, "bottom");
    await addTask(page, "top");

    const handle = page.getByRole("button", { name: "Reorder top" });
    await task(page, "top").hover();
    const from = await handle.boundingBox();
    const to = await task(page, "bottom").boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, to.y + to.height / 2, { steps: 8 });
    await page.mouse.move(from.x + 10, to.y + to.height - 4, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByTestId("task-title")).toHaveText(["bottom", "top"]);
  });
});

test.describe("finding things", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await addTask(page, "Overdue thing 2020-01-01");
    await addTask(page, "Due today today #React");
    await addTask(page, "Due later in 5 days #React");
    await addTask(page, "No date at all #SQL");
  });

  test("Today shows overdue and due-today tasks", async ({ page }) => {
    await page.getByTestId("nav-today").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Overdue thing", "Due today"]);
    await expect(page.getByRole("heading", { name: /Overdue/ })).toBeVisible();
  });

  test("overdue tasks can all be moved to today in one step, and back", async ({ page }) => {
    await page.getByTestId("nav-today").click();
    await page.getByTestId("reschedule-overdue").click();

    await expect(page.getByTestId("overdue-notice")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Overdue/ })).toHaveCount(0);
    await expect(page.getByTestId("task-item")).toHaveCount(2);

    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("overdue-notice")).toBeVisible();
  });

  test("Upcoming shows only future tasks", async ({ page }) => {
    await page.getByTestId("nav-upcoming").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Due later"]);
  });

  test("search looks through every task", async ({ page }) => {
    await page.getByTestId("search").fill("due");
    await expect(page.getByTestId("view-title")).toHaveText("Search");
    await expect(page.getByTestId("task-item")).toHaveCount(3);

    await page.getByTestId("search").fill("nothing matches this");
    await expect(page.getByTestId("empty-state")).toContainText("No tasks match");
  });

  test("a category filters the list and can be cleared", async ({ page }) => {
    await page.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: /React/ }).click();
    await expect(page.getByTestId("task-item")).toHaveCount(2);

    await page.getByRole("button", { name: "Clear category filter" }).click();
    await expect(page.getByTestId("task-item")).toHaveCount(4);
  });

  test("sorting by due date puts the most urgent first", async ({ page }) => {
    await page.getByTestId("sort").selectOption("due");
    await expect(page.getByTestId("task-title")).toHaveText(["Overdue thing", "Due today", "Due later", "No date at all"]);
  });
});

test.describe("keyboard", () => {
  test("add, move, complete and undo without touching the mouse", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("n");
    await expect(page.getByTestId("new-task-title")).toBeFocused();
    await page.keyboard.type("Second task");
    await page.keyboard.press("Enter");
    await page.keyboard.type("First task");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("x");
    await expect(page.getByTestId("task-title")).toHaveText(["First task"]);

    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("task-title")).toHaveText(["First task", "Second task"]);
  });

  test("number keys switch views and ? lists the shortcuts", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("1");
    await expect(page.getByTestId("view-title")).toHaveText("Today");
    await page.keyboard.press("5");
    await expect(page.getByTestId("view-title")).toHaveText("Progress");

    await page.keyboard.press("?");
    await expect(page.getByTestId("shortcuts-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shortcuts-dialog")).toHaveCount(0);
  });

  test("typing in a field never triggers a shortcut", async ({ page }) => {
    await openApp(page);
    await addTask(page, "next fix: 1 x 5 j k");
    await expect(page.getByTestId("view-title")).toHaveText("All tasks");
    await expect(page.getByTestId("task-title")).toHaveText(["next fix: 1 x 5 j k"]);
  });

  test("the command palette jumps to a task", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Needle in the haystack");
    await page.getByTestId("nav-progress").click();

    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("needle");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("palette")).toHaveCount(0);
    await expect(page.getByTestId("task-editor")).toBeVisible();
    await expect(page.getByTestId("edit-title")).toHaveValue("Needle in the haystack");
  });

  test("the command palette runs commands", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("dark");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("focus timer", () => {
  test("a finished session is logged against the task and shows up in Progress", async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await addTask(page, "Deep work 25m");
    await task(page, "Deep work").hover();
    await page.getByTestId("task-focus").click();

    await expect(page.getByTestId("focus-time")).toHaveText("25:00");
    await page.clock.fastForward("10:00");
    await expect(page.getByTestId("focus-time")).toHaveText("15:00");
    await expect(page).toHaveTitle(/15:00/);

    await page.clock.fastForward("15:01");
    await expect(page.getByTestId("focus-result")).toContainText("25m of focus logged");
    await expect(task(page, "Deep work").getByTestId("task-time")).toHaveText("25m / 25m");

    await page.getByTestId("focus-mark-done").click();
    await page.getByTestId("nav-progress").click();
    await expect(page.getByTestId("stat-focus")).toContainText("25m");
    await expect(page.getByTestId("stat-done")).toContainText("1");
    await expect(page.getByTestId("stat-streak")).toContainText("1 day");
  });

  test("pausing stops the clock and finishing early keeps the time", async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await addTask(page, "Interrupted 50m");
    await task(page, "Interrupted").hover();
    await page.getByTestId("task-focus").click();

    await page.clock.fastForward("05:00");
    await page.getByTestId("focus-pause").click();
    await page.clock.fastForward("30:00");
    await expect(page.getByTestId("focus-time")).toHaveText("20:00");

    await page.getByTestId("focus-resume").click();
    await page.clock.fastForward("02:00");
    await page.getByTestId("focus-stop").click();

    await expect(page.getByTestId("focus-result")).toContainText("7m of focus logged");
  });

  test("the countdown survives a reload", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Long haul");
    await task(page, "Long haul").hover();
    await page.getByTestId("task-focus").click();
    await expect(page.getByTestId("focus-bar")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("focus-bar")).toContainText("Long haul");
  });

  test("a discarded session is not logged", async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await addTask(page, "False start");
    await task(page, "False start").hover();
    await page.getByTestId("task-focus").click();
    await page.clock.fastForward("05:00");
    await page.getByTestId("focus-discard").click();

    await expect(page.getByTestId("focus-bar")).toHaveCount(0);
    expect(Object.keys((await savedData(page)).sessions)).toHaveLength(0);
  });
});

test.describe("settings and data", () => {
  test("one click switches between light and dark, and the choice sticks", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("Switch to light theme");
    // The dark page is a dark grey, not pure black, and native controls follow it.
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 18, 23)");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#141217");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("with no choice made, the theme follows the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("the theme choice sticks", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("open-settings").click();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("data can be exported and imported into a fresh browser", async ({ page, browser }) => {
    await openApp(page);
    await addTask(page, "Portable task #React");
    await page.getByTestId("open-settings").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
    const path = await download.path();

    const other = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
    await openApp(other);
    await other.getByTestId("open-settings").click();
    await other.getByTestId("import-file").setInputFiles(path);
    await expect(other.getByTestId("toast")).toContainText("Imported 1 task");
    await other.keyboard.press("Escape");
    await expect(other.getByTestId("task-title")).toHaveText(["Portable task"]);
  });

  test("a file that is not an export is refused", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("open-settings").click();
    await page.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("not json") });
    await expect(page.getByTestId("toast")).toContainText("not valid JSON");
  });

  test("a guest can erase everything on the device", async ({ page }) => {
    await openApp(page);
    await addTask(page, "Temporary");
    await page.getByTestId("open-settings").click();
    await page.getByTestId("clear-device").click();
    await page.getByTestId("confirm-clear-device").click();

    await expect(page.getByTestId("empty-state")).toBeVisible();
    expect((await savedData(page)).tasks).toEqual({});
  });

  test("two tabs stay in step", async ({ page, context }) => {
    await openApp(page);
    const second = await context.newPage();
    await openApp(second);

    await addTask(page, "Made in the first tab");
    await expect(second.getByTestId("task-title")).toHaveText(["Made in the first tab"]);
  });
});

/** A short, readable list of what axe found: rule, element, and the reason. */
async function violations(page) {
  // Colours are only meaningful once fades and slides have finished.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")} — ${node.any[0]?.message ?? node.failureSummary}`)
  );
}

test.describe("when the browser blocks storage", () => {
  test("the app still works and says plainly that nothing will be kept", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });
    await openApp(page);

    await expect(page.getByTestId("toast")).toContainText("blocking storage");
    await addTask(page, "Still usable");
    await page.getByTestId("task-complete-checkbox").click();
    await page.getByTestId("nav-done").click();
    await expect(page.getByTestId("task-title")).toHaveText(["Still usable"]);
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"]) {
    test(`no automatically detectable issues (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("lt.prefs.v1", JSON.stringify({ theme: value })), theme);
      await openApp(page);
      await page.getByTestId("add-samples").click();
      await addTask(page, "Overdue example 2020-01-01 !high");
      await page.getByTestId("task-open").first().click();
      // Let the "just added" highlight fade so colours are measured at rest.
      await expect(page.locator("[data-new]")).toHaveCount(0);
      expect(await violations(page)).toEqual([]);

      await page.getByTestId("editor-close").click();
      await page.getByTestId("nav-progress").click();
      expect(await violations(page)).toEqual([]);

      await page.getByTestId("open-settings").click();
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe("offline", () => {
  test.use({ serviceWorkers: "allow" });

  test("after one visit the app opens and works with no network at all", async ({ page, context }) => {
    await openApp(page);
    await addTask(page, "Saved before going offline");
    // Wait until the service worker has cached the app.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId("task-title")).toHaveText(["Saved before going offline"]);
    await addTask(page, "Added while offline");
    await expect(page.getByTestId("task-item")).toHaveCount(2);
  });
});
