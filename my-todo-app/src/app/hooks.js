import { useEffect, useState, useSyncExternalStore } from "react";
import { todayKey } from "../lib/dates.js";

/** Subscribes a component to one of the app's stores. */
export function useStoreState(source) {
  return useSyncExternalStore(source.subscribe, source.getState);
}

export function useSyncStatus(sync) {
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}

/** Today's date key, updated when the day rolls over while the app is open. */
export function useToday() {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    const check = () => setToday((current) => (current === todayKey() ? current : todayKey()));
    const interval = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}

/** The current time in milliseconds, refreshed on an interval while `active`. */
export function useNow(active, intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [active, intervalMs]);
  return now;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
