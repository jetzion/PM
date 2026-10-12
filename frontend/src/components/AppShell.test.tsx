import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/AppShell";
import { initialData } from "@/lib/kanban";

const mockBoardFetch = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(initialData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
  );
};

const signIn = async () => {
  await userEvent.type(screen.getByLabelText(/username/i), "user");
  await userEvent.type(screen.getByLabelText(/password/i), "password");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    mockBoardFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires the demo credentials", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/use username user and password password/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).not.toBeInTheDocument();
  });

  it("signs in, persists login, and logs out", async () => {
    const { rerender } = render(<AppShell />);

    await screen.findByRole("heading", { name: /sign in/i });
    await signIn();

    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeVisible();
    expect(localStorage.getItem("pm-demo-authenticated")).toBe("true");

    rerender(<AppShell />);
    expect(await screen.findByRole("heading", { name: /kanban studio/i })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(localStorage.getItem("pm-demo-authenticated")).toBeNull();
  });
});
