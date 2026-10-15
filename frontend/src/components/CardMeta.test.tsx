import { render, screen } from "@testing-library/react";
import { CardMeta } from "@/components/CardMeta";
import type { Card } from "@/lib/kanban";

const card = (changes: Partial<Card>): Card => ({
  id: "card-1",
  title: "Card",
  details: "",
  priority: "medium",
  dueDate: null,
  labelIds: [],
  checklist: [],
  commentCount: 0,
  ...changes,
});

describe("CardMeta", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the priority and no due date by default", () => {
    render(<CardMeta card={card({ priority: "high" })} labels={[]} />);

    expect(screen.getByText("high priority")).toBeVisible();
    expect(screen.queryByText(/due|overdue/i)).not.toBeInTheDocument();
  });

  it.each([
    ["2026-10-14", "overdue", "Overdue Oct 14, 2026"],
    ["2026-10-15", "today", "Due today Oct 15, 2026"],
    ["2026-11-02", "upcoming", "Due Nov 2, 2026"],
  ])("labels %s as %s", (dueDate, status, text) => {
    render(<CardMeta card={card({ dueDate })} labels={[]} />);

    const label = screen.getByText(text);
    expect(label).toHaveAttribute("data-due-status", status);
  });

  it("shows the card's labels in board order", () => {
    const labels = [
      { id: "label-a", name: "Alpha", color: "blue" as const },
      { id: "label-b", name: "Beta", color: "yellow" as const },
      { id: "label-c", name: "Gamma", color: "navy" as const },
    ];
    const { container } = render(
      <CardMeta card={card({ labelIds: ["label-c", "label-a"] })} labels={labels} />
    );

    const chips = [...container.querySelectorAll("[data-label-color]")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["Alpha", "Gamma"]);
    expect(chips[0]).toHaveAttribute("data-label-color", "blue");
  });

  it("shows a past due date as done rather than overdue for done cards", () => {
    render(<CardMeta card={card({ dueDate: "2026-10-01" })} labels={[]} isDone />);

    expect(screen.getByText("Done, was due Oct 1, 2026")).toHaveAttribute("data-due-status", "done");
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("shows checklist progress only when there are items", () => {
    const { container, rerender } = render(<CardMeta card={card({})} labels={[]} />);
    expect(container.querySelector("[data-checklist-progress]")).toBeNull();

    rerender(
      <CardMeta
        card={card({
          checklist: [
            { id: "a", text: "A", done: true },
            { id: "b", text: "B", done: false },
            { id: "c", text: "C", done: true },
          ],
        })}
        labels={[]}
      />
    );
    expect(screen.getByText("2/3 done")).toBeVisible();
  });
});
