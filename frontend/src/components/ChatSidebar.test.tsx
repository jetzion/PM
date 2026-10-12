import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const jsonResponse = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

const boardWithCard = (title: string): BoardData => ({
  ...initialData,
  columns: initialData.columns.map((column, index) =>
    index === 0 ? { ...column, cardIds: [...column.cardIds, "card-chat"] } : column
  ),
  cards: {
    ...initialData.cards,
    "card-chat": { id: "card-chat", title, details: "Added from chat." },
  },
});

const mockFetch = (
  chatHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/chat") {
      return chatHandler(input, init);
    }
    return jsonResponse(initialData);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const sendMessage = async (message: string) => {
  await userEvent.type(screen.getByLabelText(/message/i), message);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("ChatSidebar", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the user message and the mocked assistant reply", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ message: "Hi there.", board: null })
    );

    render(<KanbanBoard />);
    await screen.findByRole("heading", { name: /ai chat/i });
    await sendMessage("Hello");

    expect(await screen.findByText("Hi there.")).toBeVisible();
    expect(screen.getByText("Hello")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Hello", history: [] }),
      })
    );
  });

  it("renders a returned board immediately", async () => {
    mockFetch(() =>
      jsonResponse({ message: "Added Chat card.", board: boardWithCard("Chat card") })
    );

    render(<KanbanBoard />);
    await screen.findByText("Align roadmap themes");
    await sendMessage("Add a card");

    expect(await screen.findByText("Chat card")).toBeVisible();
    expect(screen.getByText("Added Chat card.")).toBeVisible();
  });

  it("leaves the board unchanged when the reply has no board", async () => {
    mockFetch(() => jsonResponse({ message: "Nothing changed.", board: null }));

    render(<KanbanBoard />);
    await screen.findByText("Align roadmap themes");
    await sendMessage("Just talk");

    expect(await screen.findByText("Nothing changed.")).toBeVisible();
    expect(screen.getByText("Align roadmap themes")).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.queryByText("Chat card")).not.toBeInTheDocument();
  });

  it("writes history to sessionStorage and restores it", async () => {
    const fetchMock = mockFetch((_input, init) => {
      const body = JSON.parse(String(init?.body));
      const reply = body.history.length === 0 ? "First reply." : "Second reply.";
      return jsonResponse({ message: reply, board: null });
    });

    const { unmount } = render(<KanbanBoard />);
    await screen.findByRole("heading", { name: /ai chat/i });
    await sendMessage("First question");
    expect(await screen.findByText("First reply.")).toBeVisible();

    await sendMessage("Second question");
    expect(await screen.findByText("Second reply.")).toBeVisible();

    expect(JSON.parse(sessionStorage.getItem("pm-chat-history") ?? "[]")).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First reply." },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second reply." },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        body: JSON.stringify({
          message: "Second question",
          history: [
            { role: "user", content: "First question" },
            { role: "assistant", content: "First reply." },
          ],
        }),
      })
    );

    unmount();
    render(<KanbanBoard />);
    expect(await screen.findByText("Second reply.")).toBeVisible();
    expect(screen.getByText("First question")).toBeVisible();
  });
});
