import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelManager } from "@/components/LabelManager";
import type { Label } from "@/lib/kanban";

const labels: Label[] = [
  { id: "label-a", name: "Bug", color: "navy" },
  { id: "label-b", name: "Ops", color: "gray" },
];

const setup = (initial: Label[] = labels) => {
  const handlers = { onAdd: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() };
  render(<LabelManager labels={initial} {...handlers} />);
  return handlers;
};

describe("LabelManager", () => {
  it("shows an empty state", () => {
    setup([]);
    expect(screen.getByText("No labels yet.")).toBeVisible();
  });

  it("adds a label with the chosen color and ignores blank names", async () => {
    const { onAdd } = setup();

    await userEvent.click(screen.getByRole("button", { name: /add label/i }));
    expect(onAdd).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("New label name"), "  Urgent ");
    await userEvent.selectOptions(screen.getByLabelText("New label color"), "purple");
    await userEvent.click(screen.getByRole("button", { name: /add label/i }));

    expect(onAdd).toHaveBeenCalledWith("Urgent", "purple");
    expect(screen.getByLabelText("New label name")).toHaveValue("");
  });

  it("renames on blur, skips unchanged names, and restores blank names", async () => {
    const { onUpdate } = setup();
    const input = screen.getByLabelText("Name of label Bug");

    await userEvent.click(input);
    await userEvent.tab();
    expect(onUpdate).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue("Bug");
    expect(onUpdate).not.toHaveBeenCalled();

    await userEvent.type(input, "fix{Enter}");
    expect(onUpdate).toHaveBeenCalledWith("label-a", { name: "Bugfix" });
  });

  it("recolors and deletes labels", async () => {
    const { onUpdate, onDelete } = setup();

    await userEvent.selectOptions(screen.getByLabelText("Color of label Ops"), "yellow");
    expect(onUpdate).toHaveBeenCalledWith("label-b", { color: "yellow" });

    await userEvent.click(screen.getByRole("button", { name: "Delete label Ops" }));
    expect(onDelete).toHaveBeenCalledWith("label-b");
  });
});
