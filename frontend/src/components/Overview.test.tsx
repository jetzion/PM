import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Overview } from "@/components/Overview";
import type { Overview as OverviewData } from "@/lib/api";
import { mockApi } from "@/test/mockApi";

const data: OverviewData = {
  today: "2026-10-15",
  boards: [
    {
      id: 1,
      name: "Kanban Studio",
      cardCount: 8,
      overdueCount: 2,
      doneCount: 2,
      priorities: { low: 3, medium: 3, high: 2 },
    },
    { id: 2, name: "Empty", cardCount: 0, overdueCount: 0, doneCount: 0, priorities: { low: 0, medium: 0, high: 0 } },
    { id: 3, name: "Launch", cardCount: 4, overdueCount: 0, doneCount: 1, priorities: { low: 0, medium: 0, high: 4 } },
  ],
  dueSoon: [
    {
      boardId: 1,
      boardName: "Kanban Studio",
      cardId: "card-7",
      title: "Ship marketing page",
      dueDate: "2026-09-01",
      priority: "low",
      columnTitle: "Done",
    },
    {
      boardId: 3,
      boardName: "Launch",
      cardId: "card-x",
      title: "Press release",
      dueDate: "2026-10-15",
      priority: "high",
      columnTitle: "To Do",
    },
    {
      boardId: 3,
      boardName: "Launch",
      cardId: "card-y",
      title: "Retro",
      dueDate: "2026-10-20",
      priority: "medium",
      columnTitle: "To Do",
    },
  ],
};

describe("Overview", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 9));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests the overview for the local date and shows totals", async () => {
    const fetchMock = mockApi({ "GET /api/overview?today=2026-10-15": { body: data } });

    render(<Overview onOpenBoard={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const tile = (label: string) => screen.getByText(label, { selector: "p" }).nextElementSibling;
    expect(tile("Boards")).toHaveTextContent("3");
    expect(tile("Cards")).toHaveTextContent("12");
    expect(tile("Overdue")).toHaveTextContent("2");
    expect(tile("High priority")).toHaveTextContent("6");
  });

  it("draws a proportional priority bar with a text legend per board", async () => {
    mockApi({ "GET /api/overview?today=2026-10-15": { body: data } });

    render(<Overview onOpenBoard={() => undefined} />);

    const studio = await screen.findByTestId("overview-board-1");
    const bar = within(studio).getByRole("img", { name: "Priority mix: 2 high, 3 medium, 3 low" });
    const widths = [...bar.children].map((segment) => [
      segment.getAttribute("data-priority"),
      (segment as HTMLElement).style.width,
    ]);
    expect(widths).toEqual([
      ["high", "25%"],
      ["medium", "37.5%"],
      ["low", "37.5%"],
    ]);
    expect(within(studio).getByText("2 overdue", { exact: false })).toBeVisible();
    expect(within(studio).getByText(/8 cards, 2 done/)).toBeVisible();
    expect(within(studio).getByText("Medium").parentElement).toHaveTextContent("Medium 3");

    // Zero-count priorities draw no segment but stay in the legend.
    const launch = screen.getByTestId("overview-board-3");
    expect(within(launch).getByRole("img").children).toHaveLength(1);
    expect(within(launch).getByText("Low").parentElement).toHaveTextContent("Low 0");

    expect(within(screen.getByTestId("overview-board-2")).getByText("No cards yet.")).toBeVisible();
  });

  it("lists due cards with status and opens their board", async () => {
    mockApi({ "GET /api/overview?today=2026-10-15": { body: data } });
    const onOpenBoard = vi.fn();

    render(<Overview onOpenBoard={onOpenBoard} />);

    const due = await screen.findByRole("region", { name: "Due soon" });
    expect(within(due).getByText("Overdue Sep 1, 2026")).toHaveAttribute("data-due-status", "overdue");
    expect(within(due).getByText("Due today Oct 15, 2026")).toBeVisible();
    expect(within(due).getByText("Due Oct 20, 2026")).toBeVisible();
    expect(within(due).getByText("Kanban Studio / Done")).toBeVisible();

    vi.useRealTimers();
    await userEvent.click(within(due).getByRole("button", { name: /press release/i }));
    expect(onOpenBoard).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: "Launch" }));
    expect(onOpenBoard).toHaveBeenLastCalledWith(3);
  });

  it("shows empty states", async () => {
    mockApi({
      "GET /api/overview?today=2026-10-15": { body: { today: "2026-10-15", boards: [], dueSoon: [] } },
    });

    render(<Overview onOpenBoard={() => undefined} />);

    expect(await screen.findByText("No boards yet.")).toBeVisible();
    expect(screen.getByText("Nothing overdue or due in the next 7 days.")).toBeVisible();
  });

  it("shows an error when loading fails", async () => {
    mockApi({});

    render(<Overview onOpenBoard={() => undefined} />);

    expect(await screen.findByText("Unable to load the overview.")).toBeVisible();
  });
});
