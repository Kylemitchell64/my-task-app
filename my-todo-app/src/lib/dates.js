// Due dates are calendar days in the user's own time zone, stored as "YYYY-MM-DD" keys.
// A key has no time and no zone, so "due Friday" means Friday wherever the user is.

const pad = (n) => String(n).padStart(2, "0");

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toKey(fromKey(value)) === value;
}

export function todayKey(now = new Date()) {
  return toKey(now);
}

export function keyFromMillis(ms) {
  return toKey(new Date(ms));
}

export function addDays(key, days) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

// Adding a month to Jan 31 lands on the last day of February, not in March.
export function addMonths(key, months) {
  const date = fromKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toKey(date);
}

export function daysBetween(fromDayKey, toDayKey) {
  const ms = Date.UTC(...ymd(toDayKey)) - Date.UTC(...ymd(fromDayKey));
  return Math.round(ms / 86_400_000);
}

function ymd(key) {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m - 1, d];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayName(key) {
  return WEEKDAYS[fromKey(key).getDay()];
}

/** "Nov 14", with the year added when it is not the current one. */
export function formatDay(key, today = todayKey()) {
  const date = fromKey(key);
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return key.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${date.getFullYear()}`;
}

/** A short label for a due date: Today, Tomorrow, a weekday this week, or a date. */
export function formatDue(key, today = todayKey()) {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return weekdayName(key);
  return formatDay(key, today);
}

/** A heading for a day in a list: "Today", "Tomorrow", or "Friday, Nov 14". */
export function formatDayHeading(key, today = todayKey()) {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${weekdayName(key)}, ${formatDay(key, today)}`;
}

export const REPEAT_LABELS = {
  "": "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
};

/**
 * The next due date for a repeating task that was just finished.
 * It steps forward from the old due date and never lands in the past, so finishing
 * a daily task three days late gives you tomorrow, not three overdue copies.
 */
export function nextOccurrence(dueKey, repeat, today = todayKey()) {
  if (!REPEAT_LABELS[repeat] || repeat === "") return null;

  let next = dueKey && isKey(dueKey) ? dueKey : today;
  for (let i = 0; i < 1000; i++) {
    next = step(next, repeat);
    if (next > today) return next;
  }
  return addDays(today, 1);
}

function step(key, repeat) {
  switch (repeat) {
    case "daily":
      return addDays(key, 1);
    case "weekdays": {
      let next = addDays(key, 1);
      while ([0, 6].includes(fromKey(next).getDay())) next = addDays(next, 1);
      return next;
    }
    case "weekly":
      return addDays(key, 7);
    case "monthly":
      return addMonths(key, 1);
    default:
      return addDays(key, 1);
  }
}

/** "45m", "1h", "1h 30m". */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "24:59" for a countdown, "1:04:59" once it passes an hour. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
