export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

/** Ids that are valid UUIDs but predictable: ...0001, ...0002, and so on. */
export function sequentialIds(prefix = "00000000-0000-4000-8000-") {
  let n = 0;
  return () => prefix + String(++n).padStart(12, "0");
}

export function fakeClock(start = Date.UTC(2026, 10, 11, 12, 0, 0)) {
  let ms = start;
  const now = () => ms;
  now.advance = (by) => {
    ms += by;
  };
  now.set = (value) => {
    ms = value;
  };
  return now;
}
