import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../src/lib/parse.js";

const today = "2026-11-11"; // a Wednesday
const parse = (text, options) => parseQuickAdd(text, { today, ...options });

describe("quick add", () => {
  it("leaves a plain title alone", () => {
    const result = parse("Read the EF Core docs");
    expect(result).toMatchObject({
      title: "Read the EF Core docs",
      category: null, priority: null, estimatedMinutes: null, dueDate: null, repeat: null,
    });
    expect(result.tokens).toEqual([]);
  });

  it("reads everything from one line", () => {
    expect(parse("Read EF Core docs 45m #csharp tomorrow !high")).toMatchObject({
      title: "Read EF Core docs",
      estimatedMinutes: 45,
      category: "csharp",
      dueDate: "2026-11-12",
      priority: 3,
    });
  });

  it("finds tokens anywhere in the line and keeps the words around them apart", () => {
    expect(parse("#react Build 1h a todo app friday").title).toBe("Build a todo app");
  });

  describe("category", () => {
    it.each([
      ["Learn generics #C#", "C#"],
      ["Practice #c++", "c++"],
      ["Pipelines #ci-cd", "ci-cd"],
      ["Study #日本語", "日本語"],
    ])("%s", (text, category) => {
      expect(parse(text).category).toBe(category);
    });

    it("ignores a # that is not a tag", () => {
      expect(parse("Fix issue #").title).toBe("Fix issue #");
      expect(parse("Review PR#42").category).toBeNull();
    });
  });

  describe("priority", () => {
    it.each([
      ["a !high", 3], ["a !h", 3], ["a !1", 3], ["a p1", 3], ["a !!!", 3],
      ["a !med", 2], ["a !medium", 2], ["a p2", 2], ["a !!", 2],
      ["a !low", 1], ["a !3", 1], ["a p3", 1], ["a !", 1],
    ])("%s", (text, priority) => {
      expect(parse(text)).toMatchObject({ title: "a", priority });
    });

    it("does not treat ordinary punctuation as priority", () => {
      expect(parse("Ship it!").priority).toBeNull();
      expect(parse("Read p10 of the book").priority).toBeNull();
    });
  });

  describe("time estimate", () => {
    it.each([
      ["a 25m", 25], ["a 25 min", 25], ["a 90 minutes", 90],
      ["a 2h", 120], ["a 1.5h", 90], ["a 1h30m", 90], ["a 1h 30m", 90], ["a 2 hours", 120],
    ])("%s", (text, minutes) => {
      expect(parse(text)).toMatchObject({ title: "a", estimatedMinutes: minutes });
    });

    it("ignores numbers that are not durations", () => {
      expect(parse("Read chapter 5").estimatedMinutes).toBeNull();
      expect(parse("Watch 3 videos").estimatedMinutes).toBeNull();
      expect(parse("Review 500m race notes").estimatedMinutes).toBe(500);
      expect(parse("A 99999m marathon").estimatedMinutes).toBeNull(); // out of range stays in the title
    });
  });

  describe("due date", () => {
    it.each([
      ["a today", "2026-11-11"],
      ["a tonight", "2026-11-11"],
      ["a tomorrow", "2026-11-12"],
      ["a tmr", "2026-11-12"],
      ["a friday", "2026-11-13"],
      ["a fri", "2026-11-13"],
      ["a on monday", "2026-11-16"],
      ["a wednesday", "2026-11-18"], // today is Wednesday, so this means next week
      ["a next week", "2026-11-18"],
      ["a next month", "2026-12-11"],
      ["a in 3 days", "2026-11-14"],
      ["a in 2 weeks", "2026-11-25"],
      ["a nov 20", "2026-11-20"],
      ["a November 20th", "2026-11-20"],
      ["a 20 nov", "2026-11-20"],
      ["a jan 5", "2027-01-05"], // already passed this year
      ["a 2026-12-25", "2026-12-25"],
    ])("%s", (text, dueDate) => {
      expect(parse(text)).toMatchObject({ title: "a", dueDate });
    });

    it("does not invent dates from ordinary words", () => {
      expect(parse("Call Tom about the project").dueDate).toBeNull();
      expect(parse("Maybe refactor later").dueDate).toBeNull();
      expect(parse("Read the Monday.com docs").dueDate).toBeNull();
      expect(parse("Plan feb 31 party").dueDate).toBeNull();
      expect(parse("Notes for 2026-13-45").dueDate).toBeNull();
    });
  });

  describe("repeat", () => {
    it.each([
      ["a daily", "daily"], ["a every day", "daily"], ["a everyday", "daily"],
      ["a weekdays", "weekdays"], ["a every weekday", "weekdays"],
      ["a weekly", "weekly"], ["a every week", "weekly"],
      ["a monthly", "monthly"], ["a every month", "monthly"],
    ])("%s", (text, repeat) => {
      expect(parse(text)).toMatchObject({ title: "a", repeat });
    });

    it("starts a repeating task today unless a date is given", () => {
      expect(parse("Review notes daily").dueDate).toBe(today);
      expect(parse("Review notes weekly friday").dueDate).toBe("2026-11-13");
    });
  });

  it("returns a chip for every token it used", () => {
    const { tokens } = parse("Deep work 2h #focus !high friday daily");
    expect(tokens.map((t) => t.type).sort()).toEqual(["category", "due", "estimate", "priority", "repeat"]);
    expect(tokens.find((t) => t.type === "estimate")).toMatchObject({ text: "2h", label: "2h" });
    expect(tokens.find((t) => t.type === "category").label).toBe("#focus");
  });

  it("keeps a token as plain text when asked to ignore it", () => {
    const result = parse("Write the daily standup notes", { ignore: ["repeat"] });
    expect(result.title).toBe("Write the daily standup notes");
    expect(result.repeat).toBeNull();
    expect(result.dueDate).toBeNull();
  });

  it("treats a line made only of tokens as a title", () => {
    expect(parse("#react")).toMatchObject({ title: "#react", category: null });
    expect(parse("tomorrow")).toMatchObject({ title: "tomorrow", dueDate: null });
  });

  it("handles empty and whitespace-only input", () => {
    expect(parse("").title).toBe("");
    expect(parse("   ").title).toBe("");
  });

  it("only takes the first token of each kind", () => {
    expect(parse("a #one #two")).toMatchObject({ title: "a #two", category: "one" });
  });
});
