// Decides which tasks a view shows, in what order, under which headings.
// Pure functions: the same inputs always give the same list.

import { formatDayHeading, keyFromMillis } from "./dates.js";
import { byManualOrder } from "./store.js";

export const VIEWS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All tasks" },
  { id: "done", label: "Done" },
  { id: "progress", label: "Progress" },
];

export const SORTS = [
  { id: "manual", label: "My order" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "newest", label: "Newest" },
];

/** How many finished tasks the Done view renders at once. */
export const DONE_PAGE = 100;

const byDue = (a, b) =>
  (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : (a.dueDate ?? "9999") > (b.dueDate ?? "9999") ? 1 : byManualOrder(a, b);
const byPriority = (a, b) => b.priority - a.priority || byDue(a, b);
const byNewest = (a, b) => b.createdAt - a.createdAt || byManualOrder(a, b);
const byCompleted = (a, b) => b.completedAt - a.completedAt;

const COMPARATORS = { manual: byManualOrder, due: byDue, priority: byPriority, newest: byNewest };

function matches(task, needle) {
  return (
    task.title.toLowerCase().includes(needle) ||
    task.description.toLowerCase().includes(needle) ||
    task.category.toLowerCase().includes(needle)
  );
}

export function countTasks(tasks, today) {
  let dueToday = 0;
  let overdue = 0;
  let upcoming = 0;
  let open = 0;
  let done = 0;
  for (const task of tasks) {
    if (task.isCompleted) {
      done++;
      continue;
    }
    open++;
    if (!task.dueDate) continue;
    if (task.dueDate < today) overdue++;
    else if (task.dueDate === today) dueToday++;
    else upcoming++;
  }
  return { today: dueToday + overdue, overdue, upcoming, all: open, done };
}

/**
 * @returns {{ sections: { id: string, title: string|null, tasks: object[], reorderable: boolean, tone?: string }[],
 *            total: number, hidden: number }}
 */
export function buildSections({ tasks, view, sort = "manual", query = "", category = null, today, doneLimit = DONE_PAGE }) {
  let pool = category ? tasks.filter((t) => t.category === category) : tasks;
  const needle = query.trim().toLowerCase();

  if (needle) {
    pool = pool.filter((t) => matches(t, needle));
    const open = pool.filter((t) => !t.isCompleted).sort(byManualOrder);
    const done = pool.filter((t) => t.isCompleted).sort(byCompleted);
    const sections = [];
    if (open.length) sections.push({ id: "open", title: "Open", tasks: open, reorderable: false });
    if (done.length) sections.push({ id: "done", title: "Done", tasks: done, reorderable: false });
    return { sections, total: pool.length, hidden: 0 };
  }

  const open = pool.filter((t) => !t.isCompleted);
  const compare = COMPARATORS[sort] ?? byManualOrder;
  const manual = compare === byManualOrder;

  switch (view) {
    case "today": {
      const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
      const due = open.filter((t) => t.dueDate === today).sort(compare);
      const sections = [];
      if (overdue.length) sections.push({ id: "overdue", title: "Overdue", tasks: overdue, reorderable: false, tone: "danger" });
      if (due.length) sections.push({ id: "today", title: overdue.length ? "Today" : null, tasks: due, reorderable: manual });
      return { sections, total: overdue.length + due.length, hidden: 0 };
    }

    case "upcoming": {
      const later = open.filter((t) => t.dueDate && t.dueDate > today).sort(byDue);
      const groups = new Map();
      for (const task of later) {
        if (!groups.has(task.dueDate)) groups.set(task.dueDate, []);
        groups.get(task.dueDate).push(task);
      }
      const sections = [...groups.entries()].map(([day, group]) => ({
        id: day,
        title: formatDayHeading(day, today),
        tasks: group,
        reorderable: true,
      }));
      return { sections, total: later.length, hidden: 0 };
    }

    case "done": {
      const done = pool.filter((t) => t.isCompleted).sort(byCompleted);
      const shown = done.slice(0, doneLimit);
      const groups = new Map();
      for (const task of shown) {
        const day = keyFromMillis(task.completedAt);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(task);
      }
      const sections = [...groups.entries()].map(([day, group]) => ({
        id: day,
        title: formatDayHeading(day, today),
        tasks: group,
        reorderable: false,
      }));
      return { sections, total: done.length, hidden: done.length - shown.length };
    }

    case "all":
    default: {
      const sorted = [...open].sort(compare);
      return {
        sections: sorted.length ? [{ id: "all", title: null, tasks: sorted, reorderable: manual }] : [],
        total: sorted.length,
        hidden: 0,
      };
    }
  }
}
