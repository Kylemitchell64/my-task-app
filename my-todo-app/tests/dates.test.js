import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, daysBetween, formatClock, formatDayHeading, formatDue, formatMinutes,
  isKey, nextOccurrence, toKey,
} from "../src/lib/dates.js";

describe("day keys", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("accepts real dates only", () => {
    expect(isKey("2026-02-28")).toBe(true);
    expect(isKey("2026-02-30")).toBe(false);
    expect(isKey("2026-2-3")).toBe(false);
    expect(isKey(null)).toBe(false);
  });

  it("adds days across month, year and daylight-saving boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // US clocks change on the 8th
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-11", "2026-11-01")).toBe(-10);
  });

  it("adds months without spilling into the next month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("labels", () => {
  const today = "2026-11-11"; // a Wednesday

  it("names nearby due dates in words", () => {
    expect(formatDue("2026-11-11", today)).toBe("Today");
    expect(formatDue("2026-11-12", today)).toBe("Tomorrow");
    expect(formatDue("2026-11-10", today)).toBe("Yesterday");
    expect(formatDue("2026-11-14", today)).toBe("Saturday");
    expect(formatDue("2026-11-18", today)).toBe("Nov 18");
    expect(formatDue("2026-11-01", today)).toBe("Nov 1");
    expect(formatDue("2027-01-02", today)).toBe("Jan 2, 2027");
  });

  it("writes list headings", () => {
    expect(formatDayHeading("2026-11-11", today)).toBe("Today");
    expect(formatDayHeading("2026-11-13", today)).toBe("Friday, Nov 13");
  });

  it("formats durations", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(95)).toBe("1h 35m");
    expect(formatClock(1499.2)).toBe("25:00");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("00:00");
  });
});

describe("repeating tasks", () => {
  const wednesday = "2026-11-11";

  it("steps forward by the rule", () => {
    expect(nextOccurrence(wednesday, "daily", wednesday)).toBe("2026-11-12");
    expect(nextOccurrence(wednesday, "weekly", wednesday)).toBe("2026-11-18");
    expect(nextOccurrence(wednesday, "monthly", wednesday)).toBe("2026-12-11");
  });

  it("skips the weekend for weekday tasks", () => {
    expect(nextOccurrence("2026-11-13", "weekdays", "2026-11-13")).toBe("2026-11-16");
    expect(nextOccurrence("2026-11-14", "weekdays", "2026-11-14")).toBe("2026-11-16");
  });

  it("never schedules the next one in the past", () => {
    // Finished a daily task three days late.
    expect(nextOccurrence("2026-11-08", "daily", wednesday)).toBe("2026-11-12");
    // Finished a weekly task early: the next one is still a week after it was due.
    expect(nextOccurrence("2026-11-13", "weekly", wednesday)).toBe("2026-11-20");
  });

  it("starts from today when there was no due date", () => {
    expect(nextOccurrence(null, "daily", wednesday)).toBe("2026-11-12");
  });

  it("returns nothing for tasks that do not repeat", () => {
    expect(nextOccurrence(wednesday, "", wednesday)).toBeNull();
    expect(nextOccurrence(wednesday, "hourly", wednesday)).toBeNull();
  });
});
