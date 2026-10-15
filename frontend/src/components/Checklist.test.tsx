import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checklist } from "@/components/Checklist";

const items = [
  { id: "item-1", text: "Pick a spacing scale", done: true },
  { id: "item-2", text: "Review with design", done: false },
];

const setup = () => {
  const handlers = { add: vi.fn(), toggle: vi.fn(), remove: vi.fn() };
  render(<Checklist cardId="card-5" cardTitle="Design" items={items} handlers={handlers} />);
  return handlers;
};

describe("Checklist", () => {
  it("renders items with their done state", () => {
    setup();

    expect(screen.getByRole("checkbox", { name: "Pick a spacing scale" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Review with design" })).not.toBeChecked();
    expect(screen.getByText("Pick a spacing scale")).toHaveClass("line-through");
  });

  it("toggles and removes items", async () => {
    const { toggle, remove } = setup();

    await userEvent.click(screen.getByRole("checkbox", { name: "Review with design" }));
    expect(toggle).toHaveBeenCalledWith("card-5", "item-2", true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Pick a spacing scale" }));
    expect(toggle).toHaveBeenLastCalledWith("card-5", "item-1", false);

    await userEvent.click(screen.getByRole("button", { name: "Remove checklist item Review with design" }));
    expect(remove).toHaveBeenCalledWith("card-5", "item-2");
  });

  it("adds trimmed items and ignores blanks", async () => {
    const { add } = setup();
    const input = screen.getByLabelText("New checklist item for Design");

    await userEvent.type(input, "   {Enter}");
    expect(add).not.toHaveBeenCalled();

    await userEvent.type(input, "  Ship it {Enter}");
    expect(add).toHaveBeenCalledWith("card-5", "Ship it");
    expect(input).toHaveValue("");
  });
});
