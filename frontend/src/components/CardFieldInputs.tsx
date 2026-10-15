import clsx from "clsx";
import { labelColorClass } from "@/components/LabelChip";
import { PRIORITIES, type Label, type Priority } from "@/lib/kanban";

type CardFieldInputsProps = {
  priority: Priority;
  dueDate: string;
  labelIds: string[];
  boardLabels: Label[];
  labelSuffix: string;
  onChange: (changes: { priority?: Priority; dueDate?: string; labelIds?: string[] }) => void;
};

const fieldClassName =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

/** Priority, due date, and label inputs shared by the new and edit card forms. */
export const CardFieldInputs = ({
  priority,
  dueDate,
  labelIds,
  boardLabels,
  labelSuffix,
  onChange,
}: CardFieldInputsProps) => {
  const toggleLabel = (labelId: string) =>
    onChange({
      labelIds: labelIds.includes(labelId)
        ? labelIds.filter((id) => id !== labelId)
        : [...labelIds, labelId],
    });

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <select
          value={priority}
          onChange={(event) => onChange({ priority: event.target.value as Priority })}
          aria-label={`Priority${labelSuffix}`}
          className={fieldClassName}
        >
          {PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option[0].toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => onChange({ dueDate: event.target.value })}
          aria-label={`Due date${labelSuffix}`}
          className={fieldClassName}
        />
      </div>
      {boardLabels.length > 0 ? (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{`Labels${labelSuffix}`}</legend>
          {boardLabels.map((label) => {
            const checked = labelIds.includes(label.id);
            return (
              <label
                key={label.id}
                className={clsx(
                  "cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
                  checked
                    ? labelColorClass[label.color]
                    : "border border-[var(--stroke)] bg-white text-[var(--gray-text)]"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLabel(label.id)}
                  className="sr-only"
                />
                {label.name}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
};
