// The app's data lives here, on the device. Every read and write is local and instant.
// Nothing in this file talks to the network: sync.js sends the rows marked dirty to the
// server when there is a server to send them to, and the app works the same either way.

import { addDays, isKey, nextOccurrence, todayKey } from "./dates.js";

export const STORAGE_KEY = "lt.data.v1";

export const LIMITS = {
  title: 200,
  description: 2000,
  category: 100,
  minEstimate: 1,
  maxEstimate: 1440,
  maxSessionSeconds: 6 * 60 * 60,
};

export const REPEATS = ["", "daily", "weekdays", "weekly", "monthly"];
export const DEFAULT_ESTIMATE = 25;

const MAX_UNDO = 30;

function emptyState() {
  return {
    tasks: {},
    sessions: {},
    meta: {
      // The account this data belongs to, or null while it has only ever lived on this device.
      owner: null,
      // The last server version this device has seen.
      cursor: 0,
      // Ids changed here that the server has not confirmed yet.
      dirtyTasks: {},
      dirtySessions: {},
      // Server time minus device time, so a wrong device clock cannot skew edit times.
      clockOffset: 0,
    },
  };
}

export function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // randomUUID needs a secure context. This path covers plain-http LAN testing.
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value, max) => (typeof value === "string" ? value : "").replaceAll("\u0000", "").slice(0, max);
const int = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const time = (value, fallback) => (Number.isFinite(value) && value > 0 ? Math.round(value) : fallback);

/** Forces any object (typed by a user, imported from a file, sent by a server) into a valid task. */
export function cleanTask(raw, nowMs) {
  if (!raw || typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  const isCompleted = raw.isCompleted === true;
  const updatedAt = time(raw.updatedAt, nowMs);
  return {
    id: raw.id.toLowerCase(),
    title: text(raw.title, LIMITS.title).trim() || "Untitled",
    description: text(raw.description, LIMITS.description),
    category: text(raw.category, LIMITS.category).trim(),
    estimatedMinutes: int(raw.estimatedMinutes, LIMITS.minEstimate, LIMITS.maxEstimate, DEFAULT_ESTIMATE),
    priority: int(raw.priority, 0, 3, 0),
    dueDate: isKey(raw.dueDate) ? raw.dueDate : null,
    repeat: REPEATS.includes(raw.repeat) ? raw.repeat : "",
    isCompleted,
    completedAt: isCompleted ? time(raw.completedAt, updatedAt) : null,
    sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
    createdAt: time(raw.createdAt, nowMs),
    updatedAt,
    deletedAt: raw.deletedAt == null ? null : time(raw.deletedAt, updatedAt),
  };
}

export function cleanSession(raw, nowMs) {
  if (!raw || typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  return {
    id: raw.id.toLowerCase(),
    taskId: typeof raw.taskId === "string" && UUID.test(raw.taskId) ? raw.taskId.toLowerCase() : null,
    startedAt: time(raw.startedAt, nowMs),
    seconds: int(raw.seconds, 1, LIMITS.maxSessionSeconds, 1),
  };
}

function cleanState(raw, nowMs) {
  const state = emptyState();
  if (!raw || typeof raw !== "object") return state;

  for (const value of Object.values(raw.tasks ?? {})) {
    const task = cleanTask(value, nowMs);
    if (task) state.tasks[task.id] = task;
  }
  for (const value of Object.values(raw.sessions ?? {})) {
    const session = cleanSession(value, nowMs);
    if (session) state.sessions[session.id] = session;
  }

  const meta = raw.meta ?? {};
  state.meta.owner = typeof meta.owner === "string" && meta.owner ? meta.owner : null;
  state.meta.cursor = Number.isSafeInteger(meta.cursor) && meta.cursor > 0 ? meta.cursor : 0;
  state.meta.clockOffset = Number.isFinite(meta.clockOffset) ? meta.clockOffset : 0;
  for (const id of Object.keys(meta.dirtyTasks ?? {})) if (state.tasks[id]) state.meta.dirtyTasks[id] = true;
  for (const id of Object.keys(meta.dirtySessions ?? {})) if (state.sessions[id]) state.meta.dirtySessions[id] = true;
  return state;
}

/** Manual order: lowest sortOrder first, newest first among ties. */
export function byManualOrder(a, b) {
  return a.sortOrder - b.sortOrder || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1);
}

export function createStore({ storage, now = () => Date.now(), newId = randomId, onStorageError } = {}) {
  let state = load();
  let undoStack = [];
  const listeners = new Set();

  function load() {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      return cleanState(saved ? JSON.parse(saved) : null, now());
    } catch {
      return emptyState();
    }
  }

  function commit(next) {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Usually a full or blocked localStorage. The change still applies for this visit.
      onStorageError?.(error);
    }
    for (const listener of listeners) listener();
  }

  const clock = () => now() + state.meta.clockOffset;

  // Every edit gets a time later than the version it replaces, even on a device whose
  // clock is behind. That is what lets "last write wins" pick the edit made last.
  const stamp = (previous) => Math.max(Math.round(clock()), (previous?.updatedAt ?? 0) + 1);

  /**
   * The one place tasks are written. `changes` are complete task objects.
   * Records what was there before so the action can be undone.
   */
  function putTasks(changes, { undo: undoLabel } = {}) {
    if (changes.length === 0) return;
    const tasks = { ...state.tasks };
    const dirtyTasks = { ...state.meta.dirtyTasks };
    const before = [];

    for (const task of changes) {
      before.push({ id: task.id, task: state.tasks[task.id] ?? null });
      if (task.deletedAt != null && state.meta.owner == null) {
        // Data that has never been synced has nobody to tell about a deletion.
        delete tasks[task.id];
        delete dirtyTasks[task.id];
      } else {
        tasks[task.id] = task;
        dirtyTasks[task.id] = true;
      }
    }

    if (undoLabel) {
      undoStack = [...undoStack.slice(-(MAX_UNDO - 1)), { label: undoLabel, before }];
    }
    commit({ ...state, tasks, meta: { ...state.meta, dirtyTasks } });
  }

  function liveTask(id) {
    const task = state.tasks[id];
    return task && task.deletedAt == null ? task : null;
  }

  function topSortOrder() {
    let min = 0;
    for (const task of Object.values(state.tasks)) {
      if (task.deletedAt == null && !task.isCompleted && task.sortOrder < min) min = task.sortOrder;
    }
    return min - 1;
  }

  // ---------- Tasks ----------

  function addTask(fields) {
    const nowMs = stamp(null);
    const task = cleanTask(
      {
        description: "",
        category: "",
        estimatedMinutes: DEFAULT_ESTIMATE,
        priority: 0,
        dueDate: null,
        repeat: "",
        ...fields,
        id: newId(),
        isCompleted: false,
        completedAt: null,
        sortOrder: topSortOrder(),
        createdAt: nowMs,
        updatedAt: nowMs,
        deletedAt: null,
      },
      nowMs
    );
    putTasks([task]);
    return task;
  }

  function updateTask(id, patch) {
    const current = liveTask(id);
    if (!current) return null;
    const next = cleanTask({ ...current, ...patch, id, updatedAt: stamp(current) }, clock());
    const changed = Object.keys(next).some((key) => key !== "updatedAt" && next[key] !== current[key]);
    if (!changed) return current;
    putTasks([next]);
    return next;
  }

  /**
   * Marks a task done or not done. Finishing a repeating task leaves the finished one in
   * the history and creates the next one, so every completion counts toward the streak.
   */
  function toggleTask(id, today = todayKey(new Date(clock()))) {
    const current = liveTask(id);
    if (!current) return null;
    const updatedAt = stamp(current);

    if (current.isCompleted) {
      putTasks([{ ...current, isCompleted: false, completedAt: null, updatedAt }], { undo: "Marked not done" });
      return null;
    }

    const changes = [{ ...current, isCompleted: true, completedAt: updatedAt, repeat: "", updatedAt }];
    let next = null;
    if (current.repeat) {
      next = {
        ...current,
        id: newId(),
        dueDate: nextOccurrence(current.dueDate, current.repeat, today),
        createdAt: updatedAt,
        updatedAt,
      };
      changes.push(next);
    }
    putTasks(changes, { undo: "Task completed" });
    return next;
  }

  /** Moves every unfinished task that is past due to today. Returns how many moved. */
  function rescheduleOverdue(today = todayKey(new Date(clock()))) {
    const changes = Object.values(state.tasks)
      .filter((t) => t.deletedAt == null && !t.isCompleted && t.dueDate && t.dueDate < today)
      .map((t) => ({ ...t, dueDate: today, updatedAt: stamp(t) }));
    putTasks(changes, { undo: "Moved to today" });
    return changes.length;
  }

  function deleteTask(id) {
    const current = liveTask(id);
    if (!current) return;
    const at = stamp(current);
    putTasks([{ ...current, deletedAt: at, updatedAt: at }], { undo: "Task deleted" });
  }

  /**
   * Moves a task to sit between two neighbours in manual order. Either neighbour may be null.
   * Positions are fractions, so a move only ever rewrites the task that moved.
   */
  function moveTask(id, previousId, nextId) {
    const current = liveTask(id);
    if (!current) return;
    let previous = previousId ? liveTask(previousId) : null;
    let next = nextId ? liveTask(nextId) : null;

    // After many moves into the same gap the fractions run out. Respace everything and retry.
    if (previous && next && next.sortOrder - previous.sortOrder < 1e-6) {
      respace();
      previous = liveTask(previousId);
      next = liveTask(nextId);
    }

    let sortOrder;
    if (previous && next) sortOrder = (previous.sortOrder + next.sortOrder) / 2;
    else if (previous) sortOrder = previous.sortOrder + 1;
    else if (next) sortOrder = next.sortOrder - 1;
    else return;

    const latest = liveTask(id);
    if (latest.sortOrder === sortOrder) return;
    putTasks([{ ...latest, sortOrder, updatedAt: stamp(latest) }]);
  }

  function respace() {
    const ordered = Object.values(state.tasks)
      .filter((t) => t.deletedAt == null)
      .sort(byManualOrder);
    putTasks(
      ordered
        .map((task, index) => ({ task, index }))
        .filter(({ task, index }) => task.sortOrder !== index)
        .map(({ task, index }) => ({ ...task, sortOrder: index, updatedAt: stamp(task) }))
    );
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  /** Puts back whatever the last undoable action replaced. Returns its label, or null. */
  function undo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return null;
    undoStack = undoStack.slice(0, -1);

    const changes = [];
    for (const { id, task } of entry.before) {
      const current = state.tasks[id];
      if (task) {
        changes.push({ ...task, updatedAt: stamp(current ?? task) });
      } else if (current) {
        const at = stamp(current);
        changes.push({ ...current, deletedAt: at, updatedAt: at });
      }
    }
    putTasks(changes);
    return entry.label;
  }

  // ---------- Focus sessions ----------

  /** Records finished focus time. Adding the same id twice is harmless. */
  function addSession(fields) {
    const session = cleanSession({ id: newId(), ...fields }, clock());
    if (!session || state.sessions[session.id]) return null;
    commit({
      ...state,
      sessions: { ...state.sessions, [session.id]: session },
      meta: { ...state.meta, dirtySessions: { ...state.meta.dirtySessions, [session.id]: true } },
    });
    return session;
  }

  // ---------- Sync support ----------

  function getDirty(limit) {
    const tasks = Object.keys(state.meta.dirtyTasks).slice(0, limit).map((id) => state.tasks[id]).filter(Boolean);
    const sessions = Object.keys(state.meta.dirtySessions).slice(0, limit).map((id) => state.sessions[id]).filter(Boolean);
    return { tasks, sessions };
  }

  function hasUnsynced() {
    return Object.keys(state.meta.dirtyTasks).length + Object.keys(state.meta.dirtySessions).length > 0;
  }

  /**
   * Folds a sync response into local data.
   * `sent` is exactly what was pushed, so an edit made while the request was in flight
   * (a different updatedAt than the one sent) stays dirty and goes out next time.
   */
  function applySync(sent, response) {
    const nowMs = now();
    const tasks = { ...state.tasks };
    const sessions = { ...state.sessions };
    const dirtyTasks = { ...state.meta.dirtyTasks };
    const dirtySessions = { ...state.meta.dirtySessions };

    for (const sentTask of sent.tasks) {
      const local = tasks[sentTask.id];
      if (!local || local.updatedAt !== sentTask.updatedAt) continue;
      delete dirtyTasks[sentTask.id];
      // The server has the deletion now, so the local marker has done its job.
      if (local.deletedAt != null) delete tasks[sentTask.id];
    }
    for (const sentSession of sent.sessions) delete dirtySessions[sentSession.id];

    // Rows the server refused (the account is full) stay on this device but stop retrying.
    for (const id of response.rejected ?? []) {
      delete dirtyTasks[id];
      delete dirtySessions[id];
    }

    for (const raw of response.tasks ?? []) {
      const incoming = cleanTask(raw, nowMs);
      if (!incoming) continue;
      const local = tasks[incoming.id];
      if (local && dirtyTasks[incoming.id] && local.updatedAt > incoming.updatedAt) continue;

      delete dirtyTasks[incoming.id];
      if (incoming.deletedAt != null) delete tasks[incoming.id];
      else tasks[incoming.id] = incoming;
    }

    for (const raw of response.sessions ?? []) {
      const incoming = cleanSession(raw, nowMs);
      if (incoming && !sessions[incoming.id]) sessions[incoming.id] = incoming;
    }

    const serverTime = Number(response.serverTime);
    const offset = Number.isFinite(serverTime) ? serverTime - nowMs : 0;

    commit({
      tasks,
      sessions,
      meta: {
        ...state.meta,
        cursor: Number.isSafeInteger(response.cursor) ? response.cursor : state.meta.cursor,
        dirtyTasks,
        dirtySessions,
        // Ignore ordinary network delay. Only correct a clock that is really off.
        clockOffset: Math.abs(offset) > 5000 ? offset : 0,
      },
    });
  }

  /** Marks everything as needing to be sent again, from the beginning. */
  function markAllDirty() {
    const dirtyTasks = Object.fromEntries(Object.keys(state.tasks).map((id) => [id, true]));
    const dirtySessions = Object.fromEntries(Object.keys(state.sessions).map((id) => [id, true]));
    commit({ ...state, meta: { ...state.meta, cursor: 0, dirtyTasks, dirtySessions } });
  }

  /**
   * Called when someone signs in.
   *  - Data that was only ever on this device joins their account.
   *  - Data already tied to this account just carries on.
   *  - Data tied to a different account is cleared so the two never mix.
   */
  function setOwner(owner) {
    if (state.meta.owner === owner) return "kept";
    if (state.meta.owner == null) {
      state = { ...state, meta: { ...state.meta, owner } };
      markAllDirty();
      return "adopted";
    }
    undoStack = [];
    commit({ ...emptyState(), meta: { ...emptyState().meta, owner } });
    return "replaced";
  }

  function clearAll() {
    undoStack = [];
    commit(emptyState());
  }

  // ---------- Import and export ----------

  function exportData() {
    return {
      app: "learning-tracker",
      version: 1,
      exportedAt: new Date(now()).toISOString(),
      tasks: Object.values(state.tasks).filter((t) => t.deletedAt == null),
      sessions: Object.values(state.sessions),
    };
  }

  /** Merges a previously exported file. Returns how many tasks and sessions were added or updated. */
  function importData(data) {
    if (!data || data.app !== "learning-tracker" || !Array.isArray(data.tasks)) {
      throw new Error("That file is not a Learning Tracker export.");
    }
    const nowMs = clock();
    const changes = [];
    for (const raw of data.tasks) {
      const incoming = cleanTask({ ...raw, deletedAt: null }, nowMs);
      if (!incoming) continue;
      const local = state.tasks[incoming.id];
      if (!local || local.deletedAt != null || incoming.updatedAt > local.updatedAt) {
        changes.push({ ...incoming, updatedAt: stamp(local) });
      }
    }
    putTasks(changes);

    let sessionCount = 0;
    for (const raw of Array.isArray(data.sessions) ? data.sessions : []) {
      if (addSession(raw)) sessionCount++;
    }
    return { tasks: changes.length, sessions: sessionCount };
  }

  function addSampleTasks(today = todayKey(new Date(clock()))) {
    const samples = [
      { title: "Skim the React docs on effects", category: "React", estimatedMinutes: 25, dueDate: today, priority: 2 },
      { title: "Build a small API endpoint from scratch", category: "C#", estimatedMinutes: 45, dueDate: addDays(today, 1), priority: 3 },
      { title: "Review yesterday's notes", category: "Habits", estimatedMinutes: 10, dueDate: today, repeat: "daily" },
      { title: "Write down three things that confused me this week", estimatedMinutes: 15, dueDate: addDays(today, 3), priority: 1 },
    ];
    // Added in reverse so the first sample ends up at the top of the list.
    for (const sample of samples.reverse()) addTask(sample);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Picks up changes written by another tab. */
    reloadFromStorage() {
      state = load();
      for (const listener of listeners) listener();
    },
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    rescheduleOverdue,
    moveTask,
    undo,
    canUndo,
    addSession,
    getDirty,
    hasUnsynced,
    applySync,
    markAllDirty,
    setOwner,
    clearAll,
    exportData,
    importData,
    addSampleTasks,
  };
}

// ---------- Derived views of the data (pure functions) ----------

function memoizeOne(fn) {
  let lastArg;
  let lastResult;
  let called = false;
  return (arg) => {
    if (!called || arg !== lastArg) {
      lastResult = fn(arg);
      lastArg = arg;
      called = true;
    }
    return lastResult;
  };
}

/** Every task that has not been deleted. */
export const liveTasks = memoizeOne((tasks) => Object.values(tasks).filter((t) => t.deletedAt == null));

/** Total focused seconds per task id. */
export const focusSecondsByTask = memoizeOne((sessions) => {
  const totals = new Map();
  for (const session of Object.values(sessions)) {
    if (session.taskId) totals.set(session.taskId, (totals.get(session.taskId) ?? 0) + session.seconds);
  }
  return totals;
});

/** Categories in use on unfinished tasks, most used first. */
export const categoryCounts = memoizeOne((tasks) => {
  const counts = new Map();
  for (const task of liveTasks(tasks)) {
    if (task.isCompleted || !task.category) continue;
    counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});

/** Every category ever used, for autocomplete. */
export const allCategories = memoizeOne((tasks) =>
  [...new Set(liveTasks(tasks).map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
);
