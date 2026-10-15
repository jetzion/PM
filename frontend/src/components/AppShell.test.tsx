import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/AppShell";
import { initialData } from "@/lib/kanban";
import { mockApi } from "@/test/mockApi";

const user = { id: 7, username: "alice" };
const boards = [
  {
    id: 1,
    name: "Kanban Studio",
    createdAt: "",
    columnCount: 5,
    cardCount: 8,
    role: "owner",
    owner: "alice",
  },
];
const workspaceRoutes = {
  "GET /api/boards": { body: boards },
  "GET /api/boards/1": { body: initialData },
};

const fillCredentials = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
};

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the sign-in form when there is no session", async () => {
    mockApi({ "GET /api/auth/me": { status: 401, body: { detail: "Not signed in" } } });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: /boards/i })).not.toBeInTheDocument();
  });

  it("shows the server error for bad credentials", async () => {
    mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/login": {
        status: 401,
        body: { detail: "Invalid username or password" },
      },
    });

    render(<AppShell />);
    await screen.findByRole("heading", { name: /sign in/i });
    await fillCredentials("alice", "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
  });

  it("signs in, opens the workspace, and logs out", async () => {
    const fetchMock = mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/login": { body: user },
      "POST /api/auth/logout": { status: 204 },
      ...workspaceRoutes,
    });
    sessionStorage.setItem("pm-chat-history:1", "[]");

    render(<AppShell />);
    await screen.findByRole("heading", { name: /sign in/i });
    await fillCredentials("alice", "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(screen.getByText(/signed in as alice/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        body: JSON.stringify({ username: "alice", password: "correct-horse" }),
      })
    );

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(sessionStorage.getItem("pm-chat-history:1")).toBeNull();
  });

  it("restores an existing session without showing the form", async () => {
    mockApi({ "GET /api/auth/me": { body: user }, ...workspaceRoutes });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("registers a new account", async () => {
    const fetchMock = mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/register": { status: 201, body: { id: 8, username: "newbie" } },
      ...workspaceRoutes,
    });

    render(<AppShell />);
    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    expect(screen.getByRole("heading", { name: /create account/i })).toBeVisible();

    await fillCredentials("newbie", "long-enough");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));

    expect(await screen.findByText(/signed in as newbie/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows registration errors and can switch back to sign in", async () => {
    mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/register": { status: 409, body: { detail: "Username is already taken" } },
    });

    render(<AppShell />);
    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    await fillCredentials("alice", "long-enough");
    await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Username is already taken");

    await userEvent.click(screen.getByRole("button", { name: /sign in instead/i }));
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
