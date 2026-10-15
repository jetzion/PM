import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";
import { jsonResponse } from "@/test/jsonResponse";
import { boardProps } from "@/test/boardProps";

const boardWithCard = (title: string): BoardData => ({
  ...initialData,
  columns: initialData.columns.map((column, index) =>
    index === 0 ? { ...column, cardIds: [...column.cardIds, "card-new"] } : column
  ),
  cards: {
    ...initialData.cards,
    "card-new": { id: "card-new", title, details: "Notes", priority: "medium", dueDate: null, labelIds: [], checklist: [], commentCount: 0 },
  },
});

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the board from the API", async () => {
    const fetchMock = vi.fn(() => jsonResponse(initialData));
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);

    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/1", expect.any(Object));
  });

  it("adds a card through the API and renders the returned board", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/cards" && init?.method === "POST") {
        return jsonResponse(boardWithCard("API card"));
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    const firstColumn = await screen.findByTestId("column-col-backlog");

    await userEvent.click(within(firstColumn).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(firstColumn).getByPlaceholderText(/card title/i), "API card");
    await userEvent.type(within(firstColumn).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(firstColumn).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("API card")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          columnId: "col-backlog",
          title: "API card",
          details: "Notes",
          priority: "medium",
          dueDate: null,
          labelIds: [],
        }),
      })
    );
  });

  it("edits a card through the API", async () => {
    const updatedBoard: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": {
          ...initialData.cards["card-1"],
          title: "Edited roadmap themes",
          details: "Edited details.",
        },
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/cards/card-1" && init?.method === "PATCH") {
        return jsonResponse(updatedBoard);
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");

    await userEvent.click(screen.getByRole("button", { name: /edit align roadmap themes/i }));
    await userEvent.clear(screen.getByLabelText(/edit title for align roadmap themes/i));
    await userEvent.type(screen.getByLabelText(/edit title for align roadmap themes/i), "Edited roadmap themes");
    await userEvent.clear(screen.getByLabelText(/edit details for align roadmap themes/i));
    await userEvent.type(screen.getByLabelText(/edit details for align roadmap themes/i), "Edited details.");
    await userEvent.click(
      within(screen.getByTestId("card-card-1")).getByRole("button", {
        name: /save/i,
      })
    );

    expect(await screen.findByText("Edited roadmap themes")).toBeVisible();
  });

  it("deletes cards and manages columns through the API", async () => {
    const withoutFirstCard: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column) =>
        column.id === "col-backlog"
          ? {
              ...column,
              cardIds: column.cardIds.filter((cardId) => cardId !== "card-1"),
            }
          : column
      ),
      cards: Object.fromEntries(
        Object.entries(initialData.cards).filter(([cardId]) => cardId !== "card-1")
      ),
    };
    const withColumn: BoardData = {
      ...withoutFirstCard,
      columns: [
        ...withoutFirstCard.columns,
        { id: "col-new", title: "New lane", cardIds: [] },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/cards/card-1" && init?.method === "DELETE") {
        return jsonResponse(withoutFirstCard);
      }
      if (input === "/api/boards/1/columns" && init?.method === "POST") {
        return jsonResponse(withColumn);
      }
      if (input === "/api/boards/1/columns/col-new" && init?.method === "DELETE") {
        return jsonResponse(withoutFirstCard);
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");

    await userEvent.click(
      screen.getByRole("button", { name: /delete align roadmap themes/i })
    );
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/new column title/i), "New lane");
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    expect(await screen.findByTestId("column-col-new")).toBeVisible();

    await userEvent.click(
      within(screen.getByTestId("column-col-new")).getByRole("button", {
        name: /delete column new lane/i,
      })
    );
    expect(screen.queryByTestId("column-col-new")).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/card-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/columns",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "New lane" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/columns/col-new",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("sends priority and due date when adding and editing cards", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/cards" && init?.method === "POST") {
        return jsonResponse(boardWithCard("Dated card"));
      }
      if (input === "/api/boards/1/cards/card-1" && init?.method === "PATCH") {
        const fields = JSON.parse(String(init.body));
        return jsonResponse({
          ...initialData,
          cards: { ...initialData.cards, "card-1": { ...initialData.cards["card-1"], ...fields } },
        });
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    const firstColumn = await screen.findByTestId("column-col-backlog");

    await userEvent.click(within(firstColumn).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(firstColumn).getByPlaceholderText(/card title/i), "Dated card");
    await userEvent.selectOptions(within(firstColumn).getByLabelText(/priority for new card/i), "high");
    await userEvent.type(within(firstColumn).getByLabelText(/due date for new card/i), "2026-11-30");
    await userEvent.click(within(firstColumn).getByRole("button", { name: /add card/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards",
      expect.objectContaining({
        body: JSON.stringify({
          columnId: "col-backlog",
          title: "Dated card",
          details: "No details yet.",
          priority: "high",
          dueDate: "2026-11-30",
          labelIds: [],
        }),
      })
    );

    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("high priority")).toBeVisible();
    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    expect(within(card).getByLabelText(/priority for align roadmap themes/i)).toHaveValue("high");
    await userEvent.selectOptions(within(card).getByLabelText(/priority for align roadmap themes/i), "low");
    await userEvent.type(within(card).getByLabelText(/due date for align roadmap themes/i), "2030-01-02");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(await within(card).findByText("low priority")).toBeVisible();
    expect(within(card).getByText("Due Jan 2, 2030")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/card-1",
      expect.objectContaining({
        body: JSON.stringify({
          title: "Align roadmap themes",
          details: "Draft quarterly themes with impact statements and metrics.",
          priority: "low",
          dueDate: "2030-01-02",
          labelIds: ["label-launch"],
        }),
      })
    );
  });

  it("manages labels and assigns them to cards", async () => {
    const withBug: BoardData = {
      ...initialData,
      labels: [...initialData.labels, { id: "label-bug", name: "Bug", color: "navy" }],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/labels" && init?.method === "POST") {
        return jsonResponse(withBug);
      }
      if (input === "/api/boards/1/labels/label-bug" && init?.method === "DELETE") {
        return jsonResponse(initialData);
      }
      if (input === "/api/boards/1/cards/card-4" && init?.method === "PATCH") {
        const fields = JSON.parse(String(init.body));
        return jsonResponse({
          ...withBug,
          cards: { ...withBug.cards, "card-4": { ...withBug.cards["card-4"], ...fields } },
        });
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Refine status language");
    expect(within(screen.getByTestId("card-card-3")).getByText("Research")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Labels (3)" }));
    const panel = screen.getByRole("region", { name: "Labels" });
    await userEvent.type(within(panel).getByLabelText("New label name"), "Bug");
    await userEvent.selectOptions(within(panel).getByLabelText("New label color"), "navy");
    await userEvent.click(within(panel).getByRole("button", { name: /add label/i }));

    expect(await within(panel).findByLabelText("Name of label Bug")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/labels",
      expect.objectContaining({ body: JSON.stringify({ name: "Bug", color: "navy" }) })
    );

    const card = screen.getByTestId("card-card-4");
    await userEvent.click(within(card).getByRole("button", { name: /edit refine status language/i }));
    await userEvent.click(within(card).getByRole("checkbox", { name: "Bug" }));
    await userEvent.click(within(card).getByRole("checkbox", { name: "Design" }));
    await userEvent.click(within(card).getByRole("checkbox", { name: "Design" }));
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(await within(card).findByText("Bug")).toBeVisible();
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)).labelIds).toEqual([
      "label-bug",
    ]);

    await userEvent.click(within(panel).getByRole("button", { name: "Delete label Bug" }));
    expect(await screen.findByRole("button", { name: "Hide labels" })).toBeVisible();
    expect(within(panel).queryByLabelText("Name of label Bug")).not.toBeInTheDocument();
  });

  it("filters visible cards and clears the filter", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(initialData)));

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    const cardCount = () => screen.queryAllByTestId(/^card-card-/).length;
    expect(cardCount()).toBe(8);
    expect(screen.queryByText(/showing \d+ of/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search cards"), "dashboard");
    expect(cardCount()).toBe(1);
    expect(screen.getByText("Prototype analytics view")).toBeVisible();
    expect(screen.getByText("Showing 1 of 8 cards")).toBeVisible();

    await userEvent.clear(screen.getByLabelText("Search cards"));
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(cardCount()).toBe(2);

    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "label-design");
    expect(screen.getAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-5",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(cardCount()).toBe(8);
    expect(screen.getByLabelText("Filter by priority")).toHaveValue("any");

    await userEvent.click(screen.getByLabelText("Overdue only"));
    expect(cardCount()).toBe(0);
    expect(screen.getByText("Showing 0 of 8 cards")).toBeVisible();
    expect(screen.getAllByText("No matching cards")).toHaveLength(5);
    expect(screen.queryByText("Drop a card here")).not.toBeInTheDocument();
  });

  it("toggles the done column and treats its cards as done", async () => {
    const dated: BoardData = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], dueDate: "2020-01-01" },
        "card-7": { ...initialData.cards["card-7"], dueDate: "2020-01-01" },
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/boards/1/done-column") {
        const { columnId } = JSON.parse(String(init?.body));
        return jsonResponse({ ...dated, doneColumnId: columnId });
      }
      return jsonResponse(dated);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    expect(screen.getByText(/5 columns, 8 cards, 2 done/)).toBeVisible();
    const doneButton = screen.getByRole("button", { name: "Done column: Done" });
    expect(doneButton).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("card-card-7")).getByText(/done, was due/i)).toBeVisible();
    expect(within(screen.getByTestId("card-card-1")).getByText(/overdue/i)).toBeVisible();

    // Overdue only skips the done card even though its date has passed.
    await userEvent.click(screen.getByLabelText("Overdue only"));
    expect(screen.queryAllByTestId(/^card-card-/).map((el) => el.dataset.testid)).toEqual([
      "card-card-1",
    ]);
    await userEvent.click(screen.getByLabelText("Overdue only"));

    await userEvent.click(doneButton);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/done-column",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ columnId: null }) })
    );
    expect(await screen.findByText(/5 columns, 8 cards$/)).toBeVisible();
    expect(within(screen.getByTestId("card-card-7")).getByText(/overdue/i)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Done column: Review" }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/done-column",
      expect.objectContaining({ body: JSON.stringify({ columnId: "col-review" }) })
    );
    expect(await screen.findByRole("button", { name: "Done column: Review" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("manages a card checklist through the API", async () => {
    const withItems = (checklist: BoardData["cards"][string]["checklist"]): BoardData => ({
      ...initialData,
      cards: { ...initialData.cards, "card-1": { ...initialData.cards["card-1"], checklist } },
    });
    const added = withItems([{ id: "item-new", text: "Draft themes", done: false }]);
    const checked = withItems([{ id: "item-new", text: "Draft themes", done: true }]);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards/1/cards/card-1/checklist" && init?.method === "POST") {
        return jsonResponse(added);
      }
      if (url === "/api/boards/1/cards/card-1/checklist/item-new" && init?.method === "PATCH") {
        return jsonResponse(checked);
      }
      if (url === "/api/boards/1/cards/card-1/checklist/item-new" && init?.method === "DELETE") {
        return jsonResponse(initialData);
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    const card = await screen.findByTestId("card-card-1");
    expect(within(screen.getByTestId("card-card-5")).getByText("1/2 done")).toBeVisible();

    const toggle = within(card).getByRole("button", { name: "Checklist for Align roadmap themes" });
    expect(toggle).toHaveTextContent("Add checklist");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.type(
      within(card).getByLabelText("New checklist item for Align roadmap themes"),
      "Draft themes{Enter}"
    );
    expect(await within(card).findByText("0/1 done")).toBeVisible();

    await userEvent.click(within(card).getByRole("checkbox", { name: "Draft themes" }));
    expect(await within(card).findByText("1/1 done")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/card-1/checklist/item-new",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ done: true }) })
    );

    await userEvent.click(
      within(card).getByRole("button", { name: "Remove checklist item Draft themes" })
    );
    expect(within(card).queryByText(/\/1 done/)).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(within(card).queryByRole("group")).not.toBeInTheDocument();
  });

  it("opens comments and keeps the card's count in sync", async () => {
    let comments: { id: string; body: string; author: string; createdAt: string }[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards/1/cards/card-1/comments" && init?.method === "POST") {
        const { body } = JSON.parse(String(init.body));
        comments = [...comments, { id: "c1", body, author: "alice", createdAt: "2026-10-15T09:30:00Z" }];
        return jsonResponse(comments);
      }
      if (url === "/api/boards/1/cards/card-1/comments/c1" && init?.method === "DELETE") {
        comments = [];
        return jsonResponse(comments);
      }
      if (url === "/api/boards/1/cards/card-1/comments") {
        return jsonResponse(comments);
      }
      return jsonResponse(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard {...boardProps} />);
    const card = await screen.findByTestId("card-card-1");
    const toggle = within(card).getByRole("button", { name: "Comments for Align roadmap themes" });
    expect(toggle).toHaveTextContent("Comments (0)");

    await userEvent.click(toggle);
    expect(await within(card).findByText("No comments yet.")).toBeVisible();
    await userEvent.type(within(card).getByLabelText(/new comment for/i), "Looks good");
    await userEvent.click(within(card).getByRole("button", { name: "Comment" }));
    expect(await within(card).findByText("Looks good")).toBeVisible();

    // Closing shows the updated count; reopening reloads from the API.
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Comments (1)");
    await userEvent.click(toggle);
    await userEvent.click(
      await within(card).findByRole("button", { name: "Delete comment Looks good" })
    );
    expect(await within(card).findByText("No comments yet.")).toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Comments (0)");
  });

  it("opens the members panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input) === "/api/boards/1/members"
          ? jsonResponse([{ id: 1, username: "alice", role: "owner" }])
          : jsonResponse(initialData)
      )
    );

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    await userEvent.click(screen.getByRole("button", { name: "Members" }));

    const panel = screen.getByRole("region", { name: "Members" });
    expect(await within(panel).findByText("alice")).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide members" })).toBeVisible();
  });
});
