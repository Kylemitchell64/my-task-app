import { describe, expect, it } from "vitest";
import {
  STORAGE_KEY, byManualOrder, categoryCounts, cleanTask, createStore, focusSecondsByTask, liveTasks,
} from "../src/lib/store.js";
import { fakeClock, memoryStorage, sequentialIds } from "./helpers.js";

function setup({ storage = memoryStorage(), now = fakeClock() } = {}) {
  const store = createStore({ storage, now, newId: sequentialIds() });
  const tasks = () => liveTasks(store.getState().tasks).sort(byManualOrder);
  return { store, storage, now, tasks };
}

describe("adding and editing", () => {
  it("adds a task with sensible defaults", () => {
    const { store, now } = setup();
    const task = store.addTask({ title: "  Learn hooks  " });

    expect(task).toMatchObject({
      title: "Learn hooks", description: "", category: "", estimatedMinutes: 25, priority: 0,
      dueDate: null, repeat: "", isCompleted: false, completedAt: null, deletedAt: null,
      createdAt: now(), updatedAt: now(),
    });
  });

  it("puts new tasks at the top", () => {
    const { store, tasks } = setup();
    store.addTask({ title: "first" });
    store.addTask({ title: "second" });
    store.addTask({ title: "third" });
    expect(tasks().map((t) => t.title)).toEqual(["third", "second", "first"]);
  });

  it("clamps and trims whatever it is given", () => {
    const { store } = setup();
    const task = store.addTask({
      title: "x".repeat(500), description: "d".repeat(5000), category: "  React  ",
      estimatedMinutes: 99999, priority: 9, dueDate: "2026-02-30", repeat: "hourly",
    });
    expect(task.title).toHaveLength(200);
    expect(task.description).toHaveLength(2000);
    expect(task).toMatchObject({ category: "React", estimatedMinutes: 1440, priority: 3, dueDate: null, repeat: "" });
  });

  it("never stores an empty title", () => {
    const { store } = setup();
    expect(store.addTask({ title: "   " }).title).toBe("Untitled");
  });

  it("updates fields and moves the edit time forward", () => {
    const { store, now } = setup();
    const task = store.addTask({ title: "a" });
    now.advance(1000);
    const updated = store.updateTask(task.id, { title: "b", priority: 2 });
    expect(updated).toMatchObject({ title: "b", priority: 2, updatedAt: now() });
  });

  it("does nothing when an update changes nothing", () => {
    const { store, now } = setup();
    const task = store.addTask({ title: "a" });
    now.advance(1000);
    expect(store.updateTask(task.id, { title: "a" })).toBe(task);
  });

  it("gives every edit a later time than the one before, even if the clock goes backwards", () => {
    const { store, now } = setup();
    const task = store.addTask({ title: "a" });
    now.advance(-60_000);
    const updated = store.updateTask(task.id, { title: "b" });
    expect(updated.updatedAt).toBe(task.updatedAt + 1);
  });

  it("rejects ids that are not uuids", () => {
    expect(cleanTask({ id: "<script>", title: "x" }, 0)).toBeNull();
    expect(cleanTask({ title: "x" }, 0)).toBeNull();
  });
});

describe("completing", () => {
  it("marks a task done and back again", () => {
    const { store, now } = setup();
    const task = store.addTask({ title: "a" });
    now.advance(5000);
    store.toggleTask(task.id);
    expect(store.getState().tasks[task.id]).toMatchObject({ isCompleted: true, completedAt: now() });

    store.toggleTask(task.id);
    expect(store.getState().tasks[task.id]).toMatchObject({ isCompleted: false, completedAt: null });
  });

  it("creates the next one when a repeating task is finished", () => {
    const { store, tasks } = setup();
    const task = store.addTask({ title: "Review notes", repeat: "daily", dueDate: "2026-11-11", category: "Habits" });

    const next = store.toggleTask(task.id, "2026-11-11");

    expect(next).toMatchObject({ title: "Review notes", repeat: "daily", dueDate: "2026-11-12", category: "Habits", isCompleted: false });
    expect(next.id).not.toBe(task.id);
    // The finished one stays in the history and no longer repeats.
    expect(store.getState().tasks[task.id]).toMatchObject({ isCompleted: true, repeat: "" });
    expect(tasks()).toHaveLength(2);
  });

  it("undoing a repeating completion removes the copy too", () => {
    const { store, tasks } = setup();
    const task = store.addTask({ title: "Review notes", repeat: "daily", dueDate: "2026-11-11" });
    store.toggleTask(task.id, "2026-11-11");

    expect(store.undo()).toBe("Task completed");
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0]).toMatchObject({ id: task.id, isCompleted: false, repeat: "daily" });
  });
});

describe("deleting and undo", () => {
  it("deletes and restores", () => {
    const { store, tasks } = setup();
    const task = store.addTask({ title: "a" });
    store.deleteTask(task.id);
    expect(tasks()).toHaveLength(0);

    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe("Task deleted");
    expect(tasks().map((t) => t.title)).toEqual(["a"]);
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toBeNull();
  });

  it("removes a never-synced task completely instead of keeping a marker", () => {
    const { store } = setup();
    const task = store.addTask({ title: "a" });
    store.deleteTask(task.id);
    expect(store.getState().tasks).toEqual({});
    expect(store.hasUnsynced()).toBe(false);
  });

  it("keeps a deletion marker once the data belongs to an account", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    store.deleteTask(task.id);
    expect(store.getState().tasks[task.id].deletedAt).not.toBeNull();
    expect(store.getDirty(10).tasks).toHaveLength(1);
  });

  it("undoes actions newest first", () => {
    const { store, tasks } = setup();
    const a = store.addTask({ title: "a" });
    const b = store.addTask({ title: "b" });
    store.toggleTask(a.id);
    store.deleteTask(b.id);

    store.undo();
    expect(tasks().map((t) => t.title).sort()).toEqual(["a", "b"]);
    store.undo();
    expect(store.getState().tasks[a.id].isCompleted).toBe(false);
  });
});

describe("overdue tasks", () => {
  it("moves them all to today in one undoable step", () => {
    const { store, tasks } = setup();
    store.addTask({ title: "late", dueDate: "2026-11-01" });
    store.addTask({ title: "later", dueDate: "2026-11-09" });
    store.addTask({ title: "future", dueDate: "2026-12-01" });
    store.addTask({ title: "undated" });
    const done = store.addTask({ title: "done late", dueDate: "2026-11-01" });
    store.toggleTask(done.id);

    expect(store.rescheduleOverdue("2026-11-11")).toBe(2);
    const due = () => Object.fromEntries(tasks().map((t) => [t.title, t.dueDate]));
    expect(due()).toEqual({ late: "2026-11-11", later: "2026-11-11", future: "2026-12-01", undated: null, "done late": "2026-11-01" });

    expect(store.undo()).toBe("Moved to today");
    expect(due()).toMatchObject({ late: "2026-11-01", later: "2026-11-09" });
    expect(store.rescheduleOverdue("2026-11-01")).toBe(0);
  });
});

describe("manual order", () => {
  function three() {
    const ctx = setup();
    const c = ctx.store.addTask({ title: "c" });
    const b = ctx.store.addTask({ title: "b" });
    const a = ctx.store.addTask({ title: "a" });
    return { ...ctx, a, b, c, titles: () => ctx.tasks().map((t) => t.title) };
  }

  it("moves a task between two others", () => {
    const { store, a, b, c, titles } = three();
    store.moveTask(a.id, b.id, c.id);
    expect(titles()).toEqual(["b", "a", "c"]);
  });

  it("moves a task to the top and to the bottom", () => {
    const { store, a, b, c, titles } = three();
    store.moveTask(c.id, null, a.id);
    expect(titles()).toEqual(["c", "a", "b"]);
    store.moveTask(c.id, b.id, null);
    expect(titles()).toEqual(["a", "b", "c"]);
  });

  it("only rewrites the task that moved", () => {
    const { store, a, b, c } = three();
    store.setOwner("a@example.com");
    store.applySync(store.getDirty(10), { cursor: 1, tasks: [], sessions: [] });
    store.moveTask(a.id, b.id, c.id);
    expect(store.getDirty(10).tasks.map((t) => t.id)).toEqual([a.id]);
  });

  it("keeps working after hundreds of moves into the same gap", () => {
    const { store, a, b, c, titles } = three();
    // Squeeze a and c alternately into the gap just above b: the gap halves every time.
    store.moveTask(c.id, a.id, b.id);
    for (let i = 0; i < 300; i++) {
      const [first, second] = titles();
      const top = first === "a" ? a : c;
      const under = second === "a" ? a : c;
      store.moveTask(top.id, under.id, b.id);
    }
    expect(titles()).toHaveLength(3);
    expect(titles()[2]).toBe("b");
    const orders = Object.values(store.getState().tasks).map((t) => t.sortOrder);
    expect(new Set(orders).size).toBe(3);
  });
});

describe("persistence", () => {
  it("survives a reload", () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.store.addTask({ title: "kept" });
    first.store.addSession({ taskId: null, startedAt: first.now(), seconds: 600 });

    const second = setup({ storage });
    expect(second.tasks().map((t) => t.title)).toEqual(["kept"]);
    expect(Object.values(second.store.getState().sessions)).toHaveLength(1);
  });

  it("starts empty when storage holds garbage", () => {
    for (const bad of ["not json", "null", "[]", '{"tasks":{"x":{"id":"nope"}},"meta":{"cursor":"NaN"}}']) {
      const { store } = setup({ storage: memoryStorage({ [STORAGE_KEY]: bad }) });
      expect(store.getState().tasks).toEqual({});
      expect(store.getState().meta.cursor).toBe(0);
    }
  });

  it("keeps working when storage is full", () => {
    const errors = [];
    const storage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    const store = createStore({ storage, onStorageError: (e) => errors.push(e) });
    store.addTask({ title: "still here" });
    expect(liveTasks(store.getState().tasks)).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("picks up changes written by another tab", () => {
    const storage = memoryStorage();
    const tabA = setup({ storage });
    const tabB = setup({ storage });
    let notified = 0;
    tabB.store.subscribe(() => notified++);

    tabA.store.addTask({ title: "from tab A" });
    tabB.store.reloadFromStorage();

    expect(tabB.tasks().map((t) => t.title)).toEqual(["from tab A"]);
    expect(notified).toBe(1);
  });
});

describe("sync bookkeeping", () => {
  it("marks local changes as needing to be sent", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    expect(store.hasUnsynced()).toBe(true);
    expect(store.getDirty(10).tasks).toEqual([task]);
  });

  it("clears the flag once the server confirms", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    store.addTask({ title: "a" });
    store.applySync(store.getDirty(10), { cursor: 7, tasks: [], sessions: [] });
    expect(store.hasUnsynced()).toBe(false);
    expect(store.getState().meta.cursor).toBe(7);
  });

  it("keeps an edit made while the request was in flight", () => {
    const { store, now } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    const sent = store.getDirty(10);

    now.advance(500);
    store.updateTask(task.id, { title: "edited mid-flight" });
    store.applySync(sent, { cursor: 1, tasks: [], sessions: [] });

    expect(store.getDirty(10).tasks.map((t) => t.title)).toEqual(["edited mid-flight"]);
  });

  it("takes rows from the server, including edits and deletions", () => {
    const { store, tasks, now } = setup();
    store.setOwner("a@example.com");
    const mine = store.addTask({ title: "mine" });
    const doomed = store.addTask({ title: "doomed" });
    store.applySync(store.getDirty(10), { cursor: 1, tasks: [], sessions: [] });

    const remote = { id: "11111111-1111-4111-8111-111111111111", title: "from my phone", updatedAt: now(), createdAt: now(), estimatedMinutes: 30 };
    store.applySync({ tasks: [], sessions: [] }, {
      cursor: 2,
      tasks: [
        remote,
        { ...mine, title: "renamed on my phone", updatedAt: mine.updatedAt + 10 },
        { ...doomed, deletedAt: now(), updatedAt: now() },
      ],
      sessions: [{ id: "22222222-2222-4222-8222-222222222222", taskId: mine.id, startedAt: now(), seconds: 1500 }],
    });

    expect(tasks().map((t) => t.title).sort()).toEqual(["from my phone", "renamed on my phone"]);
    expect(store.getState().tasks[doomed.id]).toBeUndefined();
    expect(focusSecondsByTask(store.getState().sessions).get(mine.id)).toBe(1500);
    expect(store.hasUnsynced()).toBe(false);
  });

  it("keeps a newer unsent local edit over an older server row", () => {
    const { store, now } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    store.applySync(store.getDirty(10), { cursor: 1, tasks: [], sessions: [] });

    now.advance(10_000);
    store.updateTask(task.id, { title: "local, newer" });
    store.applySync({ tasks: [], sessions: [] }, {
      cursor: 2, sessions: [],
      tasks: [{ ...task, title: "server, older", updatedAt: task.updatedAt + 1 }],
    });

    expect(store.getState().tasks[task.id].title).toBe("local, newer");
    expect(store.hasUnsynced()).toBe(true);
  });

  it("drops a deletion marker once the server has it", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    store.applySync(store.getDirty(10), { cursor: 1, tasks: [], sessions: [] });
    store.deleteTask(task.id);
    store.applySync(store.getDirty(10), { cursor: 2, tasks: [], sessions: [] });
    expect(store.getState().tasks).toEqual({});
  });

  it("stops retrying rows the server refused", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "a" });
    store.applySync({ tasks: [], sessions: [] }, { cursor: 1, tasks: [], sessions: [], rejected: [task.id] });
    expect(store.hasUnsynced()).toBe(false);
    expect(store.getState().tasks[task.id]).toBeDefined();
  });

  it("corrects for a device clock that is far off", () => {
    const { store, now } = setup();
    store.setOwner("a@example.com");
    store.applySync({ tasks: [], sessions: [] }, { cursor: 1, tasks: [], sessions: [], serverTime: now() + 3_600_000 });
    expect(store.addTask({ title: "a" }).updatedAt).toBe(now() + 3_600_000);

    // Normal network delay is not treated as clock error.
    store.applySync({ tasks: [], sessions: [] }, { cursor: 1, tasks: [], sessions: [], serverTime: now() + 800 });
    expect(store.getState().meta.clockOffset).toBe(0);
  });

  it("ignores malformed rows from the server", () => {
    const { store } = setup();
    store.applySync({ tasks: [], sessions: [] }, { cursor: 1, tasks: [{ id: "bad" }, null], sessions: [{}] });
    expect(store.getState().tasks).toEqual({});
  });
});

describe("signing in", () => {
  it("uploads tasks made before signing in", () => {
    const { store } = setup();
    store.addTask({ title: "made as a guest" });
    store.addSession({ taskId: null, startedAt: 1, seconds: 60 });
    store.applySync(store.getDirty(10), { cursor: 0, tasks: [], sessions: [] }); // nothing dirty

    expect(store.setOwner("a@example.com")).toBe("adopted");
    const dirty = store.getDirty(10);
    expect(dirty.tasks).toHaveLength(1);
    expect(dirty.sessions).toHaveLength(1);
    expect(store.getState().meta.cursor).toBe(0);
  });

  it("carries on when the same account signs in again", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    store.addTask({ title: "a" });
    store.applySync(store.getDirty(10), { cursor: 4, tasks: [], sessions: [] });

    expect(store.setOwner("a@example.com")).toBe("kept");
    expect(store.getState().meta.cursor).toBe(4);
    expect(store.hasUnsynced()).toBe(false);
  });

  it("never mixes two accounts' data", () => {
    const { store, tasks } = setup();
    store.setOwner("a@example.com");
    store.addTask({ title: "belongs to A" });

    expect(store.setOwner("b@example.com")).toBe("replaced");
    expect(tasks()).toEqual([]);
    expect(store.hasUnsynced()).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.getState().meta).toMatchObject({ owner: "b@example.com", cursor: 0 });
  });

  it("sends everything again when asked to", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    store.addTask({ title: "a" });
    store.applySync(store.getDirty(10), { cursor: 9, tasks: [], sessions: [] });

    store.markAllDirty();
    expect(store.getDirty(10).tasks).toHaveLength(1);
    expect(store.getState().meta.cursor).toBe(0);
  });
});

describe("focus sessions", () => {
  it("adds up time per task", () => {
    const { store } = setup();
    const task = store.addTask({ title: "a" });
    store.addSession({ taskId: task.id, startedAt: 1, seconds: 600 });
    store.addSession({ taskId: task.id, startedAt: 2, seconds: 300 });
    store.addSession({ taskId: null, startedAt: 3, seconds: 999 });
    expect(focusSecondsByTask(store.getState().sessions).get(task.id)).toBe(900);
  });

  it("ignores a session it already has", () => {
    const { store } = setup();
    const id = "33333333-3333-4333-8333-333333333333";
    expect(store.addSession({ id, taskId: null, startedAt: 1, seconds: 600 })).not.toBeNull();
    expect(store.addSession({ id, taskId: null, startedAt: 1, seconds: 600 })).toBeNull();
    expect(Object.keys(store.getState().sessions)).toHaveLength(1);
  });
});

describe("import and export", () => {
  it("round-trips through a file", () => {
    const source = setup();
    const done = source.store.addTask({ title: "done one", category: "React" });
    source.store.addTask({ title: "open one", dueDate: "2026-12-01", priority: 3 });
    source.store.toggleTask(done.id);
    source.store.addSession({ taskId: done.id, startedAt: 5, seconds: 1200 });

    const file = JSON.parse(JSON.stringify(source.store.exportData()));
    const target = setup();
    expect(target.store.importData(file)).toEqual({ tasks: 2, sessions: 1 });

    expect(target.tasks().map((t) => t.title).sort()).toEqual(["done one", "open one"]);
    expect(target.store.getState().tasks[done.id].isCompleted).toBe(true);
  });

  it("importing the same file twice adds nothing", () => {
    const { store } = setup();
    store.addTask({ title: "a" });
    const file = store.exportData();
    expect(store.importData(file)).toEqual({ tasks: 0, sessions: 0 });
  });

  it("refuses files that are not exports", () => {
    const { store } = setup();
    expect(() => store.importData({ tasks: [] })).toThrow(/not a Learning Tracker export/);
    expect(() => store.importData(null)).toThrow();
  });

  it("does not export deleted tasks", () => {
    const { store } = setup();
    store.setOwner("a@example.com");
    const task = store.addTask({ title: "gone" });
    store.deleteTask(task.id);
    expect(store.exportData().tasks).toEqual([]);
  });
});

describe("categories", () => {
  it("counts unfinished tasks per category, most used first", () => {
    const { store } = setup();
    store.addTask({ title: "1", category: "React" });
    store.addTask({ title: "2", category: "C#" });
    store.addTask({ title: "3", category: "C#" });
    const done = store.addTask({ title: "4", category: "SQL" });
    store.toggleTask(done.id);

    expect(categoryCounts(store.getState().tasks)).toEqual([
      { name: "C#", count: 2 },
      { name: "React", count: 1 },
    ]);
  });
});

describe("sample tasks", () => {
  it("adds a few examples in a readable order", () => {
    const { store, tasks } = setup();
    store.addSampleTasks("2026-11-11");
    expect(tasks()).toHaveLength(4);
    expect(tasks()[0].title).toMatch(/React/);
  });
});
