import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Comments } from "@/components/Comments";
import type { Comment } from "@/lib/api";

const first: Comment = { id: "c1", body: "First note", author: "alice", createdAt: "2026-10-15T09:30:00Z" };
const second: Comment = { id: "c2", body: "Second note", author: "alice", createdAt: "2026-10-15T10:00:00Z" };

const setup = (initial: Comment[] = [first]) => {
  const handlers = {
    load: vi.fn(() => Promise.resolve(initial)),
    add: vi.fn(() => Promise.resolve([...initial, second])),
    remove: vi.fn(() => Promise.resolve([] as Comment[])),
    canDelete: () => true,
  };
  render(<Comments cardId="card-1" cardTitle="Roadmap" handlers={handlers} />);
  return handlers;
};

describe("Comments", () => {
  it("loads and shows comments with author and time", async () => {
    const { load } = setup();

    expect(await screen.findByText("First note")).toBeVisible();
    expect(load).toHaveBeenCalledWith("card-1");
    expect(screen.getByText("alice")).toBeVisible();
    expect(screen.getByText("First note").parentElement?.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-10-15T09:30:00Z"
    );
  });

  it("shows an empty state", async () => {
    setup([]);
    expect(await screen.findByText("No comments yet.")).toBeVisible();
  });

  it("adds trimmed comments, ignores blanks, and deletes", async () => {
    const { add, remove } = setup();
    await screen.findByText("First note");
    const box = screen.getByLabelText("New comment for Roadmap");

    await userEvent.type(box, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(add).not.toHaveBeenCalled();

    await userEvent.type(box, " Second note ");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(add).toHaveBeenCalledWith("card-1", "Second note");
    expect(await screen.findByText("Second note")).toBeVisible();
    expect(box).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Delete comment First note" }));
    expect(remove).toHaveBeenCalledWith("card-1", "c1");
    expect(await screen.findByText("No comments yet.")).toBeVisible();
  });

  it("reports load and save failures", async () => {
    const handlers = {
      load: vi.fn(() => Promise.reject(new Error("down"))),
      add: vi.fn(() => Promise.reject(new Error("down"))),
      remove: vi.fn(),
      canDelete: () => true,
    };
    render(<Comments cardId="card-1" cardTitle="Roadmap" handlers={handlers} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load comments.");

    await userEvent.type(screen.getByLabelText("New comment for Roadmap"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the comment.");
  });

  it("hides delete for comments the user may not delete", async () => {
    const handlers = {
      load: vi.fn(() => Promise.resolve([first, { ...second, author: "bob" }])),
      add: vi.fn(),
      remove: vi.fn(),
      canDelete: (comment: Comment) => comment.author === "alice",
    };
    render(<Comments cardId="card-1" cardTitle="Roadmap" handlers={handlers} />);

    expect(await screen.findByText("Second note")).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete comment First note" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete comment Second note" })).toBeNull();
  });
});
