// Keeps this device and the user's account in step, in the background.
//
// The UI never waits on this. A sync sends whatever changed here and receives whatever
// changed elsewhere, in one request. If the server is asleep or the network is down the
// changes simply wait, and the next attempt carries them.

import { SignedOutError } from "./auth.js";

const BATCH_SIZE = 200;
const DEBOUNCE_MS = 1500;
const POLL_MS = 60_000;
const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

/** @typedef {"off"|"idle"|"syncing"|"offline"|"error"|"signed-out"} SyncPhase */

export function createSync({ store, auth, locks, isOnline = () => true, timers = globalThis }) {
  /** @type {{ phase: SyncPhase, lastSyncedAt: number|null, message: string|null }} */
  let status = { phase: auth.isSignedIn() ? "idle" : "off", lastSyncedAt: null, message: null };
  const listeners = new Set();

  let running = null;
  let again = false;
  let debounceTimer = null;
  let retryTimer = null;
  let retryDelay = MIN_RETRY_MS;

  function setStatus(patch) {
    status = { ...status, ...patch };
    for (const listener of listeners) listener();
  }

  /** One push-and-pull round trip. Returns true when another should follow straight away. */
  async function exchange() {
    const sent = store.getDirty(BATCH_SIZE);
    const response = await auth.authed("/api/sync", {
      method: "POST",
      body: { cursor: store.getState().meta.cursor, tasks: sent.tasks, sessions: sent.sessions },
    });

    if (response.reset) {
      // The server has less than this device remembers (its database was replaced).
      // Send everything again so nothing is lost.
      store.markAllDirty();
      return true;
    }

    store.applySync(sent, response);
    // A full batch means there is probably more waiting behind it.
    return sent.tasks.length === BATCH_SIZE || sent.sessions.length === BATCH_SIZE;
  }

  async function run() {
    if (!auth.isSignedIn()) {
      setStatus({ phase: auth.needsSignIn() ? "signed-out" : "off", message: null });
      return;
    }
    if (!isOnline()) {
      setStatus({ phase: "offline", message: null });
      return;
    }

    setStatus({ phase: "syncing", message: null });
    try {
      // Guard against a loop that never drains.
      for (let round = 0; round < 100; round++) {
        if (!(await exchange())) break;
      }
      retryDelay = MIN_RETRY_MS;
      setStatus({ phase: "idle", lastSyncedAt: Date.now(), message: null });
    } catch (error) {
      if (error instanceof SignedOutError) {
        setStatus({ phase: "signed-out", message: null });
        return;
      }
      const offline = !isOnline() || error?.name === "TypeError" || error?.name === "AbortError";
      setStatus({
        phase: offline ? "offline" : "error",
        message: offline ? null : error?.message ?? "Sync failed",
      });
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(() => syncNow(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

  /** Syncs now. Calls made while a sync is running are folded into one follow-up run. */
  function syncNow() {
    if (running) {
      again = true;
      return running;
    }
    timers.clearTimeout(debounceTimer);
    timers.clearTimeout(retryTimer);

    // One tab syncs at a time. The others pick up the result from storage.
    const task = locks ? locks.request("lt-sync", run) : run();
    running = Promise.resolve(task).finally(() => {
      running = null;
      if (again) {
        again = false;
        syncNow();
      } else if (status.phase === "idle" && store.hasUnsynced()) {
        // Something was edited while the request was in flight.
        syncSoon();
      }
    });
    return running;
  }

  /** Syncs soon. Used after local edits so a burst of typing becomes one request. */
  function syncSoon() {
    if (!auth.isSignedIn()) return;
    timers.clearTimeout(debounceTimer);
    debounceTimer = timers.setTimeout(() => syncNow(), DEBOUNCE_MS);
  }

  /** Wires sync to the events that should trigger it. Returns a function that unwires it. */
  function start({ window: win, document: doc }) {
    const unsubscribeStore = store.subscribe(() => {
      if (store.hasUnsynced() && status.phase !== "syncing") syncSoon();
    });
    const unsubscribeAuth = auth.subscribe(() => {
      if (auth.isSignedIn()) syncNow();
      else setStatus({ phase: auth.needsSignIn() ? "signed-out" : "off", message: null });
    });

    const onOnline = () => {
      retryDelay = MIN_RETRY_MS;
      syncNow();
    };
    const onOffline = () => setStatus({ phase: auth.isSignedIn() ? "offline" : status.phase });
    const onVisible = () => {
      if (doc.visibilityState === "visible") syncNow();
    };
    win.addEventListener("online", onOnline);
    win.addEventListener("offline", onOffline);
    doc.addEventListener("visibilitychange", onVisible);

    // Picks up changes made on other devices while this tab sits open.
    const poll = timers.setInterval(() => {
      if (doc.visibilityState === "visible") syncNow();
    }, POLL_MS);

    syncNow();

    return () => {
      unsubscribeStore();
      unsubscribeAuth();
      win.removeEventListener("online", onOnline);
      win.removeEventListener("offline", onOffline);
      doc.removeEventListener("visibilitychange", onVisible);
      timers.clearInterval(poll);
      timers.clearTimeout(debounceTimer);
      timers.clearTimeout(retryTimer);
    };
  }

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncNow,
    syncSoon,
    start,
  };
}
