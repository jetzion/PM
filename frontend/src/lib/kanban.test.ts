import {
  cardMatches,
  dueStatus,
  emptyFilter,
  formatDueDate,
  isFilterActive,
  moveCard,
  toIsoDate,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("due dates", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("classifies due dates against today", () => {
    expect(dueStatus("2026-10-14", "2026-10-15")).toBe("overdue");
    expect(dueStatus("2026-10-15", "2026-10-15")).toBe("today");
    expect(dueStatus("2026-10-16", "2026-10-15")).toBe("upcoming");
    expect(dueStatus("2025-12-31", "2026-01-01")).toBe("overdue");
    expect(dueStatus("2020-01-01", "2026-10-15", true)).toBe("done");
  });

  it("formats due dates without timezone drift", () => {
    expect(formatDueDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDueDate("2026-12-31")).toBe("Dec 31, 2026");
  });
});

describe("card filters", () => {
  const card: Card = {
    id: "card-1",
    title: "Ship Login Page",
    details: "Polish the OAuth flow",
    priority: "high",
    dueDate: "2026-10-10",
    labelIds: ["label-a"],
    checklist: [],
    commentCount: 0,
  };
  const today = "2026-10-15";
  const matches = (changes: Partial<typeof emptyFilter>, target: Card = card) =>
    cardMatches(target, { ...emptyFilter, ...changes }, today);

  it("matches everything with the empty filter", () => {
    expect(isFilterActive(emptyFilter)).toBe(false);
    expect(matches({})).toBe(true);
  });

  it("searches title and details case-insensitively, ignoring outer spaces", () => {
    expect(matches({ text: "  login " })).toBe(true);
    expect(matches({ text: "oauth" })).toBe(true);
    expect(matches({ text: "billing" })).toBe(false);
    expect(isFilterActive({ ...emptyFilter, text: "   " })).toBe(false);
  });

  it("filters by priority, label, and overdue", () => {
    expect(matches({ priority: "high" })).toBe(true);
    expect(matches({ priority: "low" })).toBe(false);
    expect(matches({ labelId: "label-a" })).toBe(true);
    expect(matches({ labelId: "label-b" })).toBe(false);
    expect(matches({ overdueOnly: true })).toBe(true);
    expect(matches({ overdueOnly: true }, { ...card, dueDate: today })).toBe(false);
    expect(matches({ overdueOnly: true }, { ...card, dueDate: null })).toBe(false);
    expect(cardMatches(card, { ...emptyFilter, overdueOnly: true }, today, true)).toBe(false);
  });

  it("requires every active filter to match", () => {
    expect(matches({ text: "ship", priority: "high", labelId: "label-a", overdueOnly: true })).toBe(
      true
    );
    expect(matches({ text: "ship", priority: "medium" })).toBe(false);
  });
});
