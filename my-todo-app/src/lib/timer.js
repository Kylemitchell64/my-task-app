// The focus timer: a countdown tied to a task (or to nothing in particular).
//
// It is stored as timestamps, not as a ticking number, so it stays correct when the tab
// sleeps, the page reloads, or another tab is watching the same timer.

export const TIMER_KEY = "lt.timer.v1";

/** Shorter than this is treated as a false start and not recorded. */
export const MIN_SESSION_SECONDS = 60;
const MAX_SECONDS = 6 * 60 * 60;

export function elapsedSeconds(timer, nowMs) {
  if (!timer) return 0;
  const running = timer.segmentStart != null ? (nowMs - timer.segmentStart) / 1000 : 0;
  return Math.min(timer.durationSec, Math.max(0, timer.elapsedBeforeSec + running));
}

export function remainingSeconds(timer, nowMs) {
  return timer ? Math.max(0, timer.durationSec - elapsedSeconds(timer, nowMs)) : 0;
}

export function createTimer({ storage, now = () => Date.now(), newId, onFinish }) {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const saved = JSON.parse(storage?.getItem(TIMER_KEY) ?? "null");
      if (saved && typeof saved.sessionId === "string" && saved.durationSec > 0) return saved;
    } catch {
      // No usable saved timer.
    }
    return null;
  }

  function set(next) {
    state = next;
    try {
      if (next) storage?.setItem(TIMER_KEY, JSON.stringify(next));
      else storage?.removeItem(TIMER_KEY);
    } catch {
      // The timer still runs for this visit.
    }
    for (const listener of listeners) listener();
  }

  function finish(completed) {
    const timer = state;
    if (!timer) return null;
    const seconds = Math.round(elapsedSeconds(timer, now()));
    set(null);
    const result = {
      sessionId: timer.sessionId,
      taskId: timer.taskId,
      startedAt: timer.startedAt,
      seconds,
      completed,
      recorded: seconds >= MIN_SESSION_SECONDS,
    };
    onFinish?.(result);
    return result;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reloadFromStorage() {
      state = load();
      for (const listener of listeners) listener();
    },

    start(taskId, minutes) {
      if (state) finish(false);
      const nowMs = now();
      set({
        sessionId: newId(),
        taskId: taskId ?? null,
        startedAt: nowMs,
        durationSec: Math.min(MAX_SECONDS, Math.max(60, Math.round(minutes * 60))),
        elapsedBeforeSec: 0,
        segmentStart: nowMs,
      });
    },

    pause() {
      if (!state || state.segmentStart == null) return;
      set({ ...state, elapsedBeforeSec: elapsedSeconds(state, now()), segmentStart: null });
    },

    resume() {
      if (!state || state.segmentStart != null) return;
      set({ ...state, segmentStart: now() });
    },

    extend(minutes) {
      if (!state) return;
      set({ ...state, durationSec: Math.min(MAX_SECONDS, state.durationSec + minutes * 60) });
    },

    /** Ends the session early and keeps the time spent so far. */
    stop: () => finish(false),

    /** Throws the session away. */
    cancel() {
      set(null);
    },

    /** Call regularly. Finishes the session once the countdown reaches zero. */
    tick() {
      if (state && state.segmentStart != null && remainingSeconds(state, now()) <= 0) {
        return finish(true);
      }
      return null;
    },
  };
}
