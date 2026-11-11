// Turns raw tasks and focus sessions into the numbers on the Progress view.

import { addDays, keyFromMillis, todayKey } from "./dates.js";

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * @param {object[]} tasks     live tasks
 * @param {object[]} sessions  focus sessions
 * @param {string}   today     day key, injectable for tests
 * @param {number}   days      how many days the chart covers
 */
export function summarize(tasks, sessions, today = todayKey(), days = 7) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const focusByDay = new Map();
  const doneByDay = new Map();
  const activeDays = new Set();

  for (const session of sessions) {
    const day = keyFromMillis(session.startedAt);
    focusByDay.set(day, (focusByDay.get(day) ?? 0) + session.seconds);
    activeDays.add(day);
  }
  for (const task of tasks) {
    if (!task.isCompleted || task.completedAt == null) continue;
    const day = keyFromMillis(task.completedAt);
    doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
    activeDays.add(day);
  }

  const firstDay = addDays(today, -(days - 1));
  const week = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(firstDay, i);
    const [y, m, d] = key.split("-").map(Number);
    week.push({
      key,
      label: SHORT_WEEKDAYS[new Date(y, m - 1, d).getDay()],
      focusSeconds: focusByDay.get(key) ?? 0,
      done: doneByDay.get(key) ?? 0,
      isToday: key === today,
    });
  }

  // A streak survives until the end of today: if nothing is done yet today,
  // count back from yesterday and flag that today still needs something.
  const activeToday = activeDays.has(today);
  let streak = 0;
  for (let day = activeToday ? today : addDays(today, -1); activeDays.has(day); day = addDays(day, -1)) {
    streak++;
  }

  const categorySeconds = new Map();
  for (const session of sessions) {
    const day = keyFromMillis(session.startedAt);
    if (day < firstDay || day > today) continue;
    const name = taskById.get(session.taskId)?.category || "Uncategorized";
    categorySeconds.set(name, (categorySeconds.get(name) ?? 0) + session.seconds);
  }

  return {
    streak,
    streakAtRisk: streak > 0 && !activeToday,
    focusTodaySeconds: focusByDay.get(today) ?? 0,
    doneToday: doneByDay.get(today) ?? 0,
    focusWeekSeconds: week.reduce((sum, d) => sum + d.focusSeconds, 0),
    doneWeek: week.reduce((sum, d) => sum + d.done, 0),
    totalFocusSeconds: sessions.reduce((sum, s) => sum + s.seconds, 0),
    totalDone: tasks.filter((t) => t.isCompleted).length,
    week,
    categories: [...categorySeconds.entries()]
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)),
  };
}
