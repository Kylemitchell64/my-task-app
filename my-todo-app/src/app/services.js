// The app's long-lived objects, created once and shared by every component.

import { createAuth } from "../lib/auth.js";
import { createPrefs, PREFS_KEY } from "../lib/prefs.js";
import { createStore, randomId, STORAGE_KEY } from "../lib/store.js";
import { createSync } from "../lib/sync.js";
import { createTimer, TIMER_KEY } from "../lib/timer.js";
import { AUTH_KEY } from "../lib/auth.js";
import { createToasts } from "./toasts.js";

// Private browsing modes can throw on any localStorage access.
function safeStorage() {
  try {
    const probe = "lt.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = safeStorage();

// The previous version of this app kept its login token under this key. It is no longer used.
try {
  storage?.removeItem("jwt");
} catch {
  // Nothing to clean up.
}
const locks = typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;

export const toasts = createToasts();

let warnedAboutStorage = false;
export const store = createStore({
  storage,
  onStorageError() {
    if (warnedAboutStorage) return;
    warnedAboutStorage = true;
    toasts.show("This browser's storage is full. New changes may not be saved.", { tone: "danger", duration: 10_000 });
  },
});

export const prefs = createPrefs({ storage });
export const auth = createAuth({ storage, locks });
export const sync = createSync({ store, auth, locks, isOnline: () => navigator.onLine !== false });

/** Listeners told when a focus session ends, so the UI can celebrate or offer the next step. */
const finishListeners = new Set();
export function onFocusFinished(listener) {
  finishListeners.add(listener);
  return () => finishListeners.delete(listener);
}

export const timer = createTimer({
  storage,
  newId: randomId,
  onFinish(result) {
    if (result.recorded) {
      // The session id comes from the timer, so two tabs finishing the same
      // countdown record it once.
      store.addSession({
        id: result.sessionId,
        taskId: result.taskId,
        startedAt: result.startedAt,
        seconds: result.seconds,
      });
    }
    for (const listener of finishListeners) listener(result);
  },
});

export const hasStorage = storage != null;

/** Keeps several open tabs showing the same thing. */
export function watchOtherTabs() {
  const reloaders = {
    [STORAGE_KEY]: () => store.reloadFromStorage(),
    [AUTH_KEY]: () => auth.reloadFromStorage(),
    [PREFS_KEY]: () => prefs.reloadFromStorage(),
    [TIMER_KEY]: () => timer.reloadFromStorage(),
  };
  const onStorage = (event) => {
    // A null key means storage was cleared entirely.
    if (event.key == null) Object.values(reloaders).forEach((reload) => reload());
    else reloaders[event.key]?.();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
