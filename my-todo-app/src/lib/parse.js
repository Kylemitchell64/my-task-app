// Turns one typed line into a task.
//
//   "Read EF Core docs 45m #csharp tomorrow !high"
//   -> title "Read EF Core docs", 45 minutes, category "csharp", due tomorrow, high priority
//
// Each recognised piece is returned as a token so the UI can show it as a chip, and the
// caller can pass a token's type in `ignore` to keep that text as part of the title.

import { addDays, addMonths, fromKey, isKey, todayKey, toKey } from "./dates.js";

export const PRIORITY_LABELS = ["None", "Low", "Medium", "High"];

const WEEKDAY_INDEX = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const WEEKDAY_PATTERN = Object.keys(WEEKDAY_INDEX).sort((a, b) => b.length - a.length).join("|");
const MONTH_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

// Every pattern starts at a word boundary we capture (start of text or whitespace)
// and must end at whitespace or the end, so tokens never match inside a word.
const START = "(^|\\s)";
const END = "(?=\\s|$)";

function nextWeekday(today, weekday) {
  const from = fromKey(today).getDay();
  const ahead = (weekday - from + 7) % 7 || 7;
  return addDays(today, ahead);
}

function monthDay(today, month, day) {
  const year = fromKey(today).getFullYear();
  for (const y of [year, year + 1]) {
    const date = new Date(y, month, day);
    if (date.getMonth() !== month) return null; // e.g. Feb 31
    const key = toKey(date);
    if (key >= today) return key;
  }
  return null;
}

const RULES = [
  {
    type: "category",
    regex: new RegExp(`${START}#([\\p{L}\\p{N}][\\p{L}\\p{N}_+.#-]{0,49})${END}`, "iu"),
    read: (m) => ({ value: m[2], label: `#${m[2]}` }),
  },
  {
    type: "priority",
    regex: new RegExp(`${START}(?:!(high|h|medium|med|m|low|l|[123])|p([123])|(!{1,3}))${END}`, "i"),
    read: (m) => {
      let value;
      if (m[2]) {
        const word = m[2].toLowerCase();
        // "!1" is the most urgent, the way "p1" is.
        if (/[123]/.test(word)) value = 4 - Number(word);
        else value = word.startsWith("h") ? 3 : word.startsWith("m") ? 2 : 1;
      } else if (m[3]) {
        value = 4 - Number(m[3]);
      } else {
        value = m[4].length;
      }
      return { value, label: `${PRIORITY_LABELS[value]} priority` };
    },
  },
  {
    type: "estimate",
    regex: new RegExp(
      `${START}(?:(\\d+(?:\\.\\d+)?)\\s?(?:hours?|hrs?|h)(?:\\s?(\\d+)\\s?(?:minutes?|mins?|m))?|(\\d+)\\s?(?:minutes?|mins?|m))${END}`,
      "i"
    ),
    read: (m) => {
      const minutes = m[2] ? Math.round(Number(m[2]) * 60) + Number(m[3] || 0) : Number(m[4]);
      if (!(minutes >= 1 && minutes <= 1440)) return null;
      return { value: minutes, label: minutes < 60 ? `${minutes} min` : formatHours(minutes) };
    },
  },
  {
    type: "repeat",
    regex: new RegExp(
      `${START}(every\\s?day|daily|every\\s+weekday|weekdays|every\\s+week|weekly|every\\s+month|monthly)${END}`,
      "i"
    ),
    read: (m) => {
      const text = m[2].toLowerCase().replace(/\s+/g, " ");
      const value = text.includes("weekday")
        ? "weekdays"
        : text.includes("week")
          ? "weekly"
          : text.includes("month")
            ? "monthly"
            : "daily";
      const label = { daily: "Every day", weekdays: "Every weekday", weekly: "Every week", monthly: "Every month" }[value];
      return { value, label };
    },
  },
  {
    type: "due",
    regex: new RegExp(
      `${START}(?:(today|tonight)|(tomorrow|tmrw|tmr)|(next\\s+week)|(next\\s+month)|in\\s+(\\d{1,3})\\s+(days?|weeks?)|(?:(?:on|next)\\s+)?(${WEEKDAY_PATTERN})|(\\d{4}-\\d{2}-\\d{2})|(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN}))${END}`,
      "i"
    ),
    read: (m, today) => {
      let value = null;
      if (m[2]) value = today;
      else if (m[3]) value = addDays(today, 1);
      else if (m[4]) value = addDays(today, 7);
      else if (m[5]) value = addMonths(today, 1);
      else if (m[6]) value = addDays(today, Number(m[6]) * (m[7].toLowerCase().startsWith("week") ? 7 : 1));
      else if (m[8]) value = nextWeekday(today, WEEKDAY_INDEX[m[8].toLowerCase()]);
      else if (m[9]) value = isKey(m[9]) ? m[9] : null;
      else if (m[10]) value = monthDay(today, MONTH_INDEX[m[10].slice(0, 3).toLowerCase()], Number(m[11]));
      else if (m[12]) value = monthDay(today, MONTH_INDEX[m[13].slice(0, 3).toLowerCase()], Number(m[12]));
      return value ? { value } : null;
    },
  },
];

function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * @param {string} text  what the user typed
 * @param {{ today?: string, ignore?: string[] }} options
 * @returns {{ title: string, category: string|null, priority: number|null,
 *            estimatedMinutes: number|null, dueDate: string|null, repeat: string|null,
 *            tokens: { type: string, text: string, label?: string, value: any }[] }}
 */
export function parseQuickAdd(text, { today = todayKey(), ignore = [] } = {}) {
  let rest = text;
  const tokens = [];

  for (const rule of RULES) {
    if (ignore.includes(rule.type)) continue;
    const match = rule.regex.exec(rest);
    if (!match) continue;
    const parsed = rule.read(match, today);
    if (!parsed) continue;

    tokens.push({ type: rule.type, text: match[0].trim(), ...parsed });
    // Keep the leading boundary so the words on either side stay separated.
    rest = rest.slice(0, match.index) + match[1] + rest.slice(match.index + match[0].length);
  }

  const title = rest.replace(/\s+/g, " ").trim();

  // A line that is nothing but tokens ("#react") is a title, not an empty task.
  if (!title) {
    return {
      title: text.replace(/\s+/g, " ").trim(),
      category: null, priority: null, estimatedMinutes: null, dueDate: null, repeat: null,
      tokens: [],
    };
  }

  const find = (type) => tokens.find((t) => t.type === type)?.value ?? null;
  const repeat = find("repeat");
  return {
    title,
    category: find("category"),
    priority: find("priority"),
    estimatedMinutes: find("estimate"),
    // A repeating task needs a first date to repeat from.
    dueDate: find("due") ?? (repeat ? today : null),
    repeat,
    tokens,
  };
}
