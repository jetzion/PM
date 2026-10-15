import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";
import { jsonResponse } from "@/test/jsonResponse";
import { boardProps } from "@/test/boardProps";

const boardWithCard = (title: string): BoardData => ({
  ...initialData,
  columns: initialData.columns.map((column, index) =>
    index === 0 ? { ...column, cardIds: [...column.cardIds, "card-chat"] } : column
  ),
  cards: {
    ...initialData.cards,
    "card-chat": {
      id: "card-chat",
      title,
      details: "Added from chat.",
      priority: "medium",
      dueDate: null,
      labelIds: [],
      checklist: [],
      commentCount: 0,
    },
  },
});

const mockFetch = (
  chatHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/boards/1/chat") {
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

    render(<KanbanBoard {...boardProps} />);
    await screen.findByRole("heading", { name: /ai chat/i });
    await sendMessage("Hello");

    expect(await screen.findByText("Hi there.")).toBeVisible();
    expect(screen.getByText("Hello")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/chat",
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

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    await sendMessage("Add a card");

    expect(await screen.findByText("Chat card")).toBeVisible();
    expect(screen.getByText("Added Chat card.")).toBeVisible();
  });

  it("leaves the board unchanged when the reply has no board", async () => {
    mockFetch(() => jsonResponse({ message: "Nothing changed.", board: null }));

    render(<KanbanBoard {...boardProps} />);
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

    const { unmount } = render(<KanbanBoard {...boardProps} />);
    await screen.findByRole("heading", { name: /ai chat/i });
    await sendMessage("First question");
    expect(await screen.findByText("First reply.")).toBeVisible();

    await sendMessage("Second question");
    expect(await screen.findByText("Second reply.")).toBeVisible();

    expect(JSON.parse(sessionStorage.getItem("pm-chat-history:1") ?? "[]")).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First reply." },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second reply." },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/chat",
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
    render(<KanbanBoard {...boardProps} />);
    expect(await screen.findByText("Second reply.")).toBeVisible();
    expect(screen.getByText("First question")).toBeVisible();
  });

  it("scrolls the message list to the newest message", async () => {
    // jsdom has no layout: give elements a height and record scrollTop writes.
    const scrolled: number[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    const scrollTop = vi
      .spyOn(HTMLElement.prototype, "scrollTop", "set")
      .mockImplementation(function (this: HTMLElement, value: number) {
        if (this.dataset.testid === "chat-messages") {
          scrolled.push(value);
        }
      });
    sessionStorage.setItem(
      "pm-chat-history:1",
      JSON.stringify([{ role: "user", content: "Earlier" }])
    );
    mockFetch(() => jsonResponse({ message: "Latest reply.", board: null }));

    render(<KanbanBoard {...boardProps} />);
    // Restored history is scrolled to the bottom.
    expect(await screen.findByText("Earlier")).toBeVisible();
    await vi.waitFor(() => expect(scrolled.length).toBeGreaterThan(0));

    scrolled.length = 0;
    await sendMessage("New question");
    expect(await screen.findByText("Latest reply.")).toBeVisible();
    expect(scrolled).toContain(900);

    scrollTop.mockRestore();
    vi.restoreAllMocks();
  });

  it("shows the server's reason when the AI call fails and keeps the draft", async () => {
    mockFetch(() =>
      jsonResponse(
        { detail: "The OpenRouter account is out of credits. Add credits at openrouter.ai to use the AI." },
        502
      )
    );

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    await sendMessage("Add a card");

    expect(
      await screen.findByText(
        "The OpenRouter account is out of credits. Add credits at openrouter.ai to use the AI."
      )
    ).toBeVisible();
    expect(screen.getByLabelText(/message/i)).toHaveValue("Add a card");
    expect(sessionStorage.getItem("pm-chat-history:1")).toBeNull();
  });

  it("falls back to a generic message when the network fails", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    render(<KanbanBoard {...boardProps} />);
    await screen.findByText("Align roadmap themes");
    await sendMessage("Hello");

    expect(await screen.findByText("Unable to reach the AI.")).toBeVisible();
  });
});
