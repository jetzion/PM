import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { initialData, toIsoDate, type BoardData } from "@/lib/kanban";
import { mockApi } from "@/test/mockApi";

const user = { id: 7, username: "alice" };
const studio = {
  id: 1,
  name: "Kanban Studio",
  createdAt: "",
  columnCount: 5,
  cardCount: 8,
  role: "owner",
  owner: "alice",
};
const launch = { ...studio, id: 2, name: "Launch", columnCount: 3, cardCount: 0 };
const emptyBoard: BoardData = {
  columns: [
    { id: "col-todo", title: "To Do", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {},
  labels: [],
  doneColumnId: "col-done",
};

const boardsNav = () => screen.getByRole("navigation", { name: /boards/i });

describe("Workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists boards and switches between them", async () => {
    mockApi({
      "GET /api/boards": { body: [studio, launch] },
      "GET /api/boards/1": { body: initialData },
      "GET /api/boards/2": { body: emptyBoard },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(within(boardsNav()).getByRole("button", { name: /kanban studio/i })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await userEvent.click(within(boardsNav()).getByRole("button", { name: /launch/i }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeVisible();
    expect(await screen.findByTestId("column-col-todo")).toBeVisible();
    expect(localStorage.getItem("pm-active-board:7")).toBe("2");
  });

  it("reopens the last selected board", async () => {
    localStorage.setItem("pm-active-board:7", "2");
    mockApi({
      "GET /api/boards": { body: [studio, launch] },
      "GET /api/boards/2": { body: emptyBoard },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeVisible();
  });

  it("creates a board and selects it", async () => {
    const fetchMock = mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "POST /api/boards": { status: 201, body: launch },
      "GET /api/boards/2": { body: emptyBoard },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.type(screen.getByLabelText(/new board name/i), "Launch");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeVisible();
    expect(screen.getByLabelText(/new board name/i)).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Launch" }) })
    );
  });

  it("shows an error when board creation fails", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "POST /api/boards": { status: 400, body: { detail: "Board name is required" } },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(screen.getByLabelText(/new board name/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Board name is required");
  });

  it("renames the active board in the header and the list", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "PATCH /api/boards/1": { body: { ...studio, name: "Roadmap" } },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    await userEvent.clear(screen.getByLabelText("Board name"));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: /save name/i }));

    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeVisible();
    expect(within(boardsNav()).getByRole("button", { name: /roadmap/i })).toBeVisible();
  });

  it("deletes a board after confirmation and falls back to the next one", async () => {
    const fetchMock = mockApi({
      "GET /api/boards": { body: [studio, launch] },
      "GET /api/boards/1": { body: initialData },
      "GET /api/boards/2": { body: emptyBoard },
      "DELETE /api/boards/1": { status: 204 },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    await userEvent.click(screen.getByRole("button", { name: /keep board/i }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/boards/1", expect.objectContaining({ method: "DELETE" }));

    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeVisible();
    expect(within(boardsNav()).queryByRole("button", { name: /kanban studio/i })).toBeNull();
  });

  it("shows an empty state when the last board is deleted", async () => {
    mockApi({
      "GET /api/boards": { body: [launch] },
      "GET /api/boards/2": { body: emptyBoard },
      "DELETE /api/boards/2": { status: 204 },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Launch" });
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByText(/create a board to get started/i)).toBeVisible();
    expect(screen.getByText(/no boards yet/i)).toBeVisible();
  });

  it("updates the card count in the list after a board change", async () => {
    const withoutCard: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column) => ({
        ...column,
        cardIds: column.cardIds.filter((id) => id !== "card-1"),
      })),
      cards: Object.fromEntries(
        Object.entries(initialData.cards).filter(([id]) => id !== "card-1")
      ),
    };
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "DELETE /api/boards/1/cards/card-1": { body: withoutCard },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByText("Align roadmap themes");
    expect(within(boardsNav()).getByText("8 cards")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));

    expect(await within(boardsNav()).findByText("7 cards")).toBeVisible();
  });

  it("changes the password from the account panel", async () => {
    const fetchMock = mockApi({
      "GET /api/boards": { body: [] },
      "PUT /api/auth/password": (body) =>
        (body as { currentPassword: string }).currentPassword === "old-password"
          ? { status: 204 }
          : { status: 400, body: { detail: "Current password is incorrect" } },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: /account/i }));
    const panel = screen.getByRole("region", { name: /account settings/i });

    await userEvent.type(within(panel).getByLabelText(/current password/i), "nope-nope");
    await userEvent.type(within(panel).getByLabelText(/new password/i), "brand-new-pass");
    await userEvent.click(within(panel).getByRole("button", { name: /update password/i }));
    expect(await within(panel).findByRole("status")).toHaveTextContent(
      "Current password is incorrect"
    );

    await userEvent.clear(within(panel).getByLabelText(/current password/i));
    await userEvent.type(within(panel).getByLabelText(/current password/i), "old-password");
    await userEvent.click(within(panel).getByRole("button", { name: /update password/i }));
    expect(await within(panel).findByText("Password updated.")).toBeVisible();
    expect(within(panel).getByLabelText(/current password/i)).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ currentPassword: "old-password", newPassword: "brand-new-pass" }),
      })
    );

    await userEvent.click(within(panel).getByRole("button", { name: /done/i }));
    expect(screen.queryByRole("region", { name: /account settings/i })).toBeNull();
  });

  it("calls onLogout", async () => {
    mockApi({ "GET /api/boards": { body: [] } });
    const onLogout = vi.fn();

    render(<Workspace user={user} onLogout={onLogout} onSessionEnded={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));

    expect(onLogout).toHaveBeenCalled();
  });

  it("signs out everywhere", async () => {
    const fetchMock = mockApi({
      "GET /api/boards": { body: [] },
      "POST /api/auth/logout-all": { status: 204 },
    });
    const onSessionEnded = vi.fn();

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={onSessionEnded} />);
    await userEvent.click(await screen.findByRole("button", { name: /^account$/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign out everywhere/i }));

    expect(onSessionEnded).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout-all",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("deletes the account only with the right password", async () => {
    mockApi({
      "GET /api/boards": { body: [] },
      "POST /api/auth/delete-account": (body) =>
        (body as { password: string }).password === "right-password"
          ? { status: 204 }
          : { status: 400, body: { detail: "Password is incorrect" } },
    });
    const onSessionEnded = vi.fn();

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={onSessionEnded} />);
    await userEvent.click(await screen.findByRole("button", { name: /^account$/i }));

    await userEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/confirm password to delete/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    await userEvent.type(screen.getByLabelText(/confirm password to delete/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(onSessionEnded).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/confirm password to delete/i));
    await userEvent.type(screen.getByLabelText(/confirm password to delete/i), "right-password");
    await userEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
  });

  it("switches to the overview, remembers it, and opens a board from it", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      [`GET /api/overview?today=${toIsoDate(new Date())}`]: {
        body: {
          today: toIsoDate(new Date()),
          boards: [{ ...studio, overdueCount: 0, doneCount: 2, priorities: { low: 3, medium: 3, high: 2 } }],
          dueSoon: [],
        },
      },
    });

    const { unmount } = render(
      <Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />
    );
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await userEvent.click(within(boardsNav()).getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(within(boardsNav()).getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(boardsNav()).getByRole("button", { name: /kanban studio/i })).not.toHaveAttribute(
      "aria-current"
    );
    expect(localStorage.getItem("pm-active-board:7")).toBe("overview");

    unmount();
    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();

    await userEvent.click(
      within(screen.getByRole("region", { name: "Board summaries" })).getByRole("button", {
        name: "Kanban Studio",
      })
    );
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(localStorage.getItem("pm-active-board:7")).toBe("1");
  });

  it("duplicates the active board and opens the copy", async () => {
    const copy = { ...studio, id: 3, name: "Kanban Studio copy" };
    const fetchMock = mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "POST /api/boards/1/duplicate": { status: 201, body: copy },
      "GET /api/boards/3": { body: initialData },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.click(screen.getByRole("button", { name: /duplicate board/i }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio copy" })).toBeVisible();
    expect(within(boardsNav()).getByRole("button", { name: /kanban studio copy/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/duplicate",
      expect.objectContaining({ body: JSON.stringify({ name: "Kanban Studio copy" }) })
    );
  });

  it("shows an error when duplication fails", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      "POST /api/boards/1/duplicate": { status: 500 },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.click(screen.getByRole("button", { name: /duplicate board/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed: 500");
  });

  it("shows shared boards and lets a member leave", async () => {
    const shared = { ...launch, id: 5, name: "Team plan", role: "member", owner: "bob" };
    const fetchMock = mockApi({
      "GET /api/boards": { body: [studio, shared] },
      "GET /api/boards/1": { body: initialData },
      "GET /api/boards/5": { body: emptyBoard },
      "DELETE /api/boards/5/members/7": { body: [] },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    expect(within(boardsNav()).getByText("Shared by bob")).toBeVisible();

    await userEvent.click(within(boardsNav()).getByRole("button", { name: /team plan/i }));
    expect(await screen.findByRole("heading", { name: "Team plan" })).toBeVisible();
    expect(screen.getAllByText("Shared by bob")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /rename board/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete board/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm leave/i }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(within(boardsNav()).queryByText("Team plan")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/5/members/7",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows an error when leaving fails", async () => {
    const shared = { ...launch, id: 5, name: "Team plan", role: "member", owner: "bob" };
    mockApi({
      "GET /api/boards": { body: [shared] },
      "GET /api/boards/5": { body: emptyBoard },
      "DELETE /api/boards/5/members/7": { status: 500 },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: /leave board/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm leave/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed: 500");
  });

  it("collapses and expands the sidebar and remembers the choice", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
    });

    const { unmount } = render(
      <Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />
    );
    await screen.findByRole("heading", { name: "Kanban Studio" });
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(collapse);
    expect(screen.queryByRole("navigation", { name: "Boards" })).toBeNull();
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    // The board itself stays open while the sidebar is collapsed.
    expect(screen.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(localStorage.getItem("pm-sidebar-collapsed")).toBe("true");

    unmount();
    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    const expand = await screen.findByRole("button", { name: "Expand sidebar" });
    expect(screen.queryByRole("navigation", { name: "Boards" })).toBeNull();

    await userEvent.click(expand);
    expect(screen.getByRole("navigation", { name: "Boards" })).toBeVisible();
    expect(localStorage.getItem("pm-sidebar-collapsed")).toBe("false");
  });

  it("still toggles when storage is unavailable", async () => {
    mockApi({ "GET /api/boards": { body: [] } });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("shows the board's AI chat in the sidebar, and only for an open board", async () => {
    mockApi({
      "GET /api/boards": { body: [studio] },
      "GET /api/boards/1": { body: initialData },
      [`GET /api/overview?today=${toIsoDate(new Date())}`]: {
        body: { today: toIsoDate(new Date()), boards: [], dueSoon: [] },
      },
    });

    render(<Workspace user={user} onLogout={() => undefined} onSessionEnded={() => undefined} />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    const sidebar = screen.getByRole("complementary", { name: "Workspace" });
    expect(within(sidebar).getByRole("complementary", { name: "AI chat" })).toBeVisible();

    await userEvent.click(within(sidebar).getByRole("button", { name: /^close$/i }));
    expect(within(sidebar).queryByRole("complementary", { name: "AI chat" })).toBeNull();
    await userEvent.click(within(sidebar).getByRole("button", { name: "Open chat" }));
    expect(within(sidebar).getByRole("complementary", { name: "AI chat" })).toBeVisible();

    await userEvent.click(within(boardsNav()).getByRole("button", { name: "Overview" }));
    await screen.findByRole("heading", { name: "Overview" });
    expect(screen.queryByRole("complementary", { name: "AI chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open chat" })).toBeNull();

    await userEvent.click(within(boardsNav()).getByRole("button", { name: /kanban studio/i }));
    await screen.findByRole("complementary", { name: "AI chat" });
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByRole("complementary", { name: "AI chat" })).toBeNull();
  });
});
