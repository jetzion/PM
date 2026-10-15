import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersPanel } from "@/components/MembersPanel";
import { mockApi } from "@/test/mockApi";

const owner = { id: 1, username: "alice", role: "owner" };
const bob = { id: 2, username: "bob", role: "member" };
const carol = { id: 3, username: "carol", role: "member" };

describe("MembersPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the owner share, see errors, and remove members", async () => {
    const fetchMock = mockApi({
      "GET /api/boards/1/members": { body: [owner, bob] },
      "POST /api/boards/1/members": (body) =>
        (body as { username: string }).username === "carol"
          ? { status: 201, body: [owner, bob, carol] }
          : { status: 404, body: { detail: "No user with that username" } },
      "DELETE /api/boards/1/members/2": { body: [owner, carol] },
    });

    render(<MembersPanel boardId={1} isOwner />);
    const panel = await screen.findByRole("region", { name: "Members" });
    expect(await within(panel).findByText("bob")).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Remove alice" })).toBeNull();

    await userEvent.type(within(panel).getByLabelText("Share with username"), "ghost");
    await userEvent.click(within(panel).getByRole("button", { name: "Share" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("No user with that username");
    expect(within(panel).getByLabelText("Share with username")).toHaveValue("ghost");

    await userEvent.clear(within(panel).getByLabelText("Share with username"));
    await userEvent.type(within(panel).getByLabelText("Share with username"), "carol");
    await userEvent.click(within(panel).getByRole("button", { name: "Share" }));
    expect(await within(panel).findByText("carol")).toBeVisible();
    expect(within(panel).getByLabelText("Share with username")).toHaveValue("");
    expect(within(panel).queryByRole("alert")).toBeNull();

    await userEvent.click(within(panel).getByRole("button", { name: "Remove bob" }));
    expect(await within(panel).findByText("carol")).toBeVisible();
    expect(within(panel).queryByText("bob")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/members/2",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("is read-only for members", async () => {
    mockApi({ "GET /api/boards/1/members": { body: [owner, bob] } });

    render(<MembersPanel boardId={1} isOwner={false} />);

    expect(await screen.findByText("alice")).toBeVisible();
    expect(screen.queryByLabelText("Share with username")).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("shows a load error", async () => {
    mockApi({});
    render(<MembersPanel boardId={1} isOwner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load members.");
  });
});
