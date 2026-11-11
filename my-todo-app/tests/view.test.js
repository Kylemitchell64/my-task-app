import { describe, expect, it } from "vitest";
import { buildSections, countTasks } from "../src/lib/view.js";

const today = "2026-11-11";
let n = 0;
const task = (title, extra = {}) => ({
  id: `id-${++n}`, title, description: "", category: "", priority: 0, dueDate: null,
  isCompleted: false, completedAt: null, sortOrder: n, createdAt: n, ...extra,
});
const at = (key, hour = 12) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};
const titles = (result) => result.sections.map((s) => [s.title, s.tasks.map((t) => t.title)]);

const tasks = [
  task("overdue", { dueDate: "2026-11-09" }),
  task("due today, low", { dueDate: today, priority: 1 }),
  task("due today, high", { dueDate: today, priority: 3 }),
  task("tomorrow", { dueDate: "2026-11-12", category: "React" }),
  task("next week", { dueDate: "2026-11-18" }),
  task("someday", { category: "React", description: "has the word needle in it" }),
  task("finished yesterday", { isCompleted: true, completedAt: at("2026-11-10"), dueDate: "2026-11-09" }),
  task("finished today", { isCompleted: true, completedAt: at(today), category: "React" }),
];

describe("counts", () => {
  it("counts what each view will show", () => {
    expect(countTasks(tasks, today)).toEqual({ today: 3, overdue: 1, upcoming: 2, all: 6, done: 2 });
  });
});

describe("views", () => {
  it("Today shows overdue first, then what is due today", () => {
    expect(titles(buildSections({ tasks, view: "today", today }))).toEqual([
      ["Overdue", ["overdue"]],
      ["Today", ["due today, low", "due today, high"]],
    ]);
  });

  it("Today has no heading when nothing is overdue", () => {
    const result = buildSections({ tasks: tasks.filter((t) => t.title !== "overdue"), view: "today", today });
    expect(result.sections.map((s) => s.title)).toEqual([null]);
  });

  it("Upcoming groups by day, soonest first", () => {
    expect(titles(buildSections({ tasks, view: "upcoming", today }))).toEqual([
      ["Tomorrow", ["tomorrow"]],
      ["Wednesday, Nov 18", ["next week"]],
    ]);
  });

  it("All shows every unfinished task in the chosen order", () => {
    const all = (sort) => buildSections({ tasks, view: "all", sort, today }).sections[0].tasks.map((t) => t.title);
    expect(all("manual")).toEqual(["overdue", "due today, low", "due today, high", "tomorrow", "next week", "someday"]);
    expect(all("priority").slice(0, 2)).toEqual(["due today, high", "due today, low"]);
    expect(all("due")).toEqual(["overdue", "due today, low", "due today, high", "tomorrow", "next week", "someday"]);
    expect(all("newest")[0]).toBe("someday");
  });

  it("Done groups finished tasks by the day they were finished, newest first", () => {
    expect(titles(buildSections({ tasks, view: "done", today }))).toEqual([
      ["Today", ["finished today"]],
      ["Yesterday", ["finished yesterday"]],
    ]);
  });

  it("Done shows a page at a time and says how many are hidden", () => {
    const many = Array.from({ length: 250 }, (_, i) => task(`done ${i}`, { isCompleted: true, completedAt: at(today) + i }));
    const result = buildSections({ tasks: many, view: "done", today, doneLimit: 100 });
    expect(result.sections[0].tasks).toHaveLength(100);
    expect(result).toMatchObject({ total: 250, hidden: 150 });
  });

  it("only allows dragging where the order is the user's own", () => {
    const reorderable = (view, sort) => buildSections({ tasks, view, sort, today }).sections.map((s) => s.reorderable);
    expect(reorderable("all", "manual")).toEqual([true]);
    expect(reorderable("all", "priority")).toEqual([false]);
    expect(reorderable("today", "manual")).toEqual([false, true]);
    expect(reorderable("done", "manual")).toEqual([false, false]);
  });

  it("returns no sections for an empty view", () => {
    expect(buildSections({ tasks: [], view: "all", today })).toEqual({ sections: [], total: 0, hidden: 0 });
    expect(buildSections({ tasks: [], view: "today", today }).sections).toEqual([]);
  });
});

describe("filtering", () => {
  it("filters any view by category", () => {
    expect(titles(buildSections({ tasks, view: "all", category: "React", today }))).toEqual([[null, ["tomorrow", "someday"]]]);
    expect(titles(buildSections({ tasks, view: "done", category: "React", today }))).toEqual([["Today", ["finished today"]]]);
  });

  it("searches titles, notes and categories across open and finished tasks", () => {
    expect(titles(buildSections({ tasks, view: "today", query: "  NEEDLE ", today }))).toEqual([["Open", ["someday"]]]);
    expect(titles(buildSections({ tasks, view: "all", query: "react", today }))).toEqual([
      ["Open", ["tomorrow", "someday"]],
      ["Done", ["finished today"]],
    ]);
    expect(buildSections({ tasks, view: "all", query: "zzz", today }).sections).toEqual([]);
  });
});
