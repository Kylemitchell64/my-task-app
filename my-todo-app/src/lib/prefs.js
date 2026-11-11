// Small per-device settings. These never sync: a phone and a laptop can differ.

export const PREFS_KEY = "lt.prefs.v1";

export const DEFAULT_PREFS = {
  theme: "system", // "system" | "light" | "dark"
  view: "all", // which list was open last
  sort: "manual", // "manual" | "due" | "priority" | "newest"
  focusMinutes: 25,
  sound: true,
  notifications: false,
};

const VALID = {
  theme: ["system", "light", "dark"],
  view: ["today", "upcoming", "all", "done", "progress"],
  sort: ["manual", "due", "priority", "newest"],
};

function clean(raw) {
  const prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== "object") return prefs;
  for (const key of Object.keys(VALID)) {
    if (VALID[key].includes(raw[key])) prefs[key] = raw[key];
  }
  const minutes = Math.round(Number(raw.focusMinutes));
  if (minutes >= 1 && minutes <= 180) prefs.focusMinutes = minutes;
  if (typeof raw.sound === "boolean") prefs.sound = raw.sound;
  if (typeof raw.notifications === "boolean") prefs.notifications = raw.notifications;
  return prefs;
}

export function createPrefs({ storage }) {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      return clean(JSON.parse(storage?.getItem(PREFS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(patch) {
      state = clean({ ...state, ...patch });
      try {
        storage?.setItem(PREFS_KEY, JSON.stringify(state));
      } catch {
        // Applies for this visit only.
      }
      for (const listener of listeners) listener();
    },
    reloadFromStorage() {
      state = load();
      for (const listener of listeners) listener();
    },
  };
}
