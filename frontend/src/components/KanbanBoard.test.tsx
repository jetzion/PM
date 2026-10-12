import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const response = (board: BoardData) =>
  Promise.resolve(
    new Response(JSON.stringify(board), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

const boardWithCard = (title: string): BoardData => ({
  ...initialData,
  columns: initialData.columns.map((column, index) =>
    index === 0 ? { ...column, cardIds: [...column.cardIds, "card-new"] } : column
  ),
  cards: {
    ...initialData.cards,
    "card-new": { id: "card-new", title, details: "Notes" },
  },
});

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the board from the API", async () => {
    const fetchMock = vi.fn(() => response(initialData));
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard />);

    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", expect.any(Object));
  });

  it("adds a card through the API and renders the returned board", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/cards" && init?.method === "POST") {
        return response(boardWithCard("API card"));
      }
      return response(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard />);
    const firstColumn = await screen.findByTestId("column-col-backlog");

    await userEvent.click(within(firstColumn).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(firstColumn).getByPlaceholderText(/card title/i), "API card");
    await userEvent.type(within(firstColumn).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(firstColumn).getByRole("button", { name: /add card/i }));

    expect(await screen.findByText("API card")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ columnId: "col-backlog", title: "API card", details: "Notes" }),
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
      if (input === "/api/cards/card-1" && init?.method === "PATCH") {
        return response(updatedBoard);
      }
      return response(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard />);
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
      if (input === "/api/cards/card-1" && init?.method === "DELETE") {
        return response(withoutFirstCard);
      }
      if (input === "/api/columns" && init?.method === "POST") {
        return response(withColumn);
      }
      if (input === "/api/columns/col-new" && init?.method === "DELETE") {
        return response(withoutFirstCard);
      }
      return response(initialData);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<KanbanBoard />);
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
      "/api/cards/card-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/columns",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "New lane" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/columns/col-new",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
