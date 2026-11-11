import { describe, expect, it } from "vitest";
import { summarize } from "../src/lib/stats.js";
import { createTimer, elapsedSeconds, remainingSeconds } from "../src/lib/timer.js";
import { createPrefs, DEFAULT_PREFS } from "../src/lib/prefs.js";
import { fakeClock, memoryStorage, sequentialIds } from "./helpers.js";

function setup(storage = memoryStorage()) {
  const now = fakeClock();
  const finished = [];
  const timer = createTimer({ storage, now, newId: sequentialIds(), onFinish: (r) => finished.push(r) });
  return { timer, now, finished, storage };
}

describe("focus timer", () => {
  it("counts down from the chosen length", () => {
    const { timer, now } = setup();
    timer.start("task-1", 25);
    now.advance(10 * 60_000);
    expect(remainingSeconds(timer.getState(), now())).toBe(15 * 60);
    expect(elapsedSeconds(timer.getState(), now())).toBe(10 * 60);
  });

  it("finishes itself at zero and reports the full time", () => {
    const { timer, now, finished } = setup();
    timer.start("task-1", 25);
    now.advance(24 * 60_000);
    expect(timer.tick()).toBeNull();

    now.advance(5 * 60_000); // the tab was asleep and woke up late
    const result = timer.tick();

    expect(result).toMatchObject({ taskId: "task-1", seconds: 1500, completed: true, recorded: true });
    expect(finished).toHaveLength(1);
    expect(timer.getState()).toBeNull();
  });

  it("does not count paused time", () => {
    const { timer, now } = setup();
    timer.start(null, 25);
    now.advance(5 * 60_000);
    timer.pause();
    now.advance(60 * 60_000);
    expect(timer.tick()).toBeNull();
    expect(remainingSeconds(timer.getState(), now())).toBe(20 * 60);

    timer.resume();
    now.advance(60_000);
    expect(elapsedSeconds(timer.getState(), now())).toBe(6 * 60);
  });

  it("keeps the time spent when stopped early", () => {
    const { timer, now } = setup();
    timer.start("task-1", 25);
    now.advance(12 * 60_000);
    expect(timer.stop()).toMatchObject({ seconds: 720, completed: false, recorded: true });
  });

  it("does not record a false start", () => {
    const { timer, now } = setup();
    timer.start("task-1", 25);
    now.advance(20_000);
    expect(timer.stop()).toMatchObject({ seconds: 20, recorded: false });
  });

  it("can be extended and cancelled", () => {
    const { timer, now, finished } = setup();
    timer.start(null, 25);
    timer.extend(5);
    expect(remainingSeconds(timer.getState(), now())).toBe(30 * 60);
    timer.cancel();
    expect(timer.getState()).toBeNull();
    expect(finished).toHaveLength(0);
  });

  it("wraps up the running session when another is started", () => {
    const { timer, now, finished } = setup();
    timer.start("task-1", 25);
    now.advance(10 * 60_000);
    timer.start("task-2", 50);

    expect(finished).toEqual([expect.objectContaining({ taskId: "task-1", seconds: 600 })]);
    expect(timer.getState()).toMatchObject({ taskId: "task-2", durationSec: 3000 });
  });

  it("survives a reload, and finishes if time ran out while the page was closed", () => {
    const storage = memoryStorage();
    const first = setup(storage);
    first.timer.start("task-1", 25);

    const finished = [];
    const now = fakeClock(first.now() + 40 * 60_000);
    const second = createTimer({ storage, now, newId: sequentialIds(), onFinish: (r) => finished.push(r) });
    expect(second.getState()).toMatchObject({ taskId: "task-1" });
    second.tick();

    expect(finished).toEqual([expect.objectContaining({ seconds: 1500, completed: true })]);
  });

  it("gives the same session id to every tab, so it is only recorded once", () => {
    const storage = memoryStorage();
    const tabA = setup(storage);
    tabA.timer.start("task-1", 25);
    const tabB = setup(storage);
    expect(tabB.timer.getState().sessionId).toBe(tabA.timer.getState().sessionId);
  });
});

describe("progress summary", () => {
  const today = "2026-11-11";
  const at = (key, hour = 12) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  };
  const done = (key, extra = {}) => ({ id: `${key}-${Math.random()}`, isCompleted: true, completedAt: at(key), category: "", ...extra });
  const session = (key, seconds, taskId = null) => ({ id: `${key}-${seconds}`, taskId, startedAt: at(key), seconds });

  it("is all zeroes for a new user", () => {
    const summary = summarize([], [], today);
    expect(summary).toMatchObject({ streak: 0, streakAtRisk: false, focusTodaySeconds: 0, doneToday: 0, focusWeekSeconds: 0 });
    expect(summary.week).toHaveLength(7);
    expect(summary.week[6]).toMatchObject({ key: today, isToday: true, label: "Wed" });
    expect(summary.week[0].key).toBe("2026-11-05");
  });

  it("counts a streak of consecutive active days", () => {
    const tasks = [done("2026-11-11"), done("2026-11-10")];
    const sessions = [session("2026-11-09", 600)];
    expect(summarize(tasks, sessions, today)).toMatchObject({ streak: 3, streakAtRisk: false });
  });

  it("keeps yesterday's streak alive until today ends", () => {
    const summary = summarize([done("2026-11-10"), done("2026-11-09")], [], today);
    expect(summary).toMatchObject({ streak: 2, streakAtRisk: true });
  });

  it("breaks the streak after a missed day", () => {
    expect(summarize([done("2026-11-09"), done("2026-11-08")], [], today).streak).toBe(0);
    expect(summarize([done("2026-11-11"), done("2026-11-09")], [], today).streak).toBe(1);
  });

  it("totals focus time and completions per day", () => {
    const tasks = [done("2026-11-11"), done("2026-11-11"), done("2026-11-08"), done("2026-10-01")];
    const sessions = [session("2026-11-11", 1500), session("2026-11-11", 900), session("2026-11-07", 600), session("2026-10-01", 9999)];
    const summary = summarize(tasks, sessions, today);

    expect(summary).toMatchObject({ focusTodaySeconds: 2400, doneToday: 2, focusWeekSeconds: 3000, doneWeek: 3, totalDone: 4 });
    expect(summary.week.find((d) => d.key === "2026-11-07").focusSeconds).toBe(600);
    expect(summary.totalFocusSeconds).toBe(1500 + 900 + 600 + 9999);
  });

  it("uses the local day for late-night work", () => {
    const lateNight = { id: "s", taskId: null, startedAt: at("2026-11-10", 23), seconds: 600 };
    const summary = summarize([], [lateNight], today);
    expect(summary.week.find((d) => d.key === "2026-11-10").focusSeconds).toBe(600);
  });

  it("breaks this week's focus down by category", () => {
    const tasks = [
      { id: "t1", category: "React", isCompleted: false },
      { id: "t2", category: "C#", isCompleted: false },
    ];
    const sessions = [
      session("2026-11-11", 600, "t1"), session("2026-11-10", 1200, "t2"), session("2026-11-09", 300, "t2"),
      session("2026-11-08", 60, null), session("2026-11-07", 61, "deleted-task"), session("2026-10-01", 5000, "t1"),
    ];
    expect(summarize(tasks, sessions, today).categories).toEqual([
      { name: "C#", seconds: 1500 },
      { name: "React", seconds: 600 },
      { name: "Uncategorized", seconds: 121 },
    ]);
  });
});

describe("preferences", () => {
  it("starts from defaults and remembers changes", () => {
    const storage = memoryStorage();
    const prefs = createPrefs({ storage });
    expect(prefs.getState()).toEqual(DEFAULT_PREFS);

    prefs.set({ theme: "dark", focusMinutes: 50 });
    expect(createPrefs({ storage }).getState()).toMatchObject({ theme: "dark", focusMinutes: 50 });
  });

  it("ignores values it does not understand", () => {
    const prefs = createPrefs({ storage: memoryStorage({ "lt.prefs.v1": '{"theme":"neon","focusMinutes":9000,"view":"done"}' }) });
    expect(prefs.getState()).toMatchObject({ theme: "system", focusMinutes: 25, view: "done" });
  });
});
