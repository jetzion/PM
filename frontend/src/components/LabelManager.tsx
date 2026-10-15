import { useState, type FormEvent } from "react";
import { LabelChip } from "@/components/LabelChip";
import { LABEL_COLORS, type Label, type LabelColor } from "@/lib/kanban";

type LabelManagerProps = {
  labels: Label[];
  onAdd: (name: string, color: LabelColor) => void;
  onUpdate: (labelId: string, changes: { name?: string; color?: LabelColor }) => void;
  onDelete: (labelId: string) => void;
};

const fieldClassName =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const ColorSelect = ({
  value,
  label,
  onChange,
}: {
  value: LabelColor;
  label: string;
  onChange: (color: LabelColor) => void;
}) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value as LabelColor)}
    aria-label={label}
    className={fieldClassName}
  >
    {LABEL_COLORS.map((color) => (
      <option key={color} value={color}>
        {color}
      </option>
    ))}
  </select>
);

const LabelRow = ({
  label,
  onUpdate,
  onDelete,
}: { label: Label } & Pick<LabelManagerProps, "onUpdate" | "onDelete">) => {
  const [name, setName] = useState(label.name);

  const commitName = () => {
    const nextName = name.trim();
    if (!nextName) {
      setName(label.name);
    } else if (nextName !== label.name) {
      onUpdate(label.id, { name: nextName });
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2">
      <LabelChip label={label} />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        aria-label={`Name of label ${label.name}`}
        className={`${fieldClassName} w-32`}
      />
      <ColorSelect
        value={label.color}
        label={`Color of label ${label.name}`}
        onChange={(color) => onUpdate(label.id, { color })}
      />
      <button
        type="button"
        onClick={() => onDelete(label.id)}
        aria-label={`Delete label ${label.name}`}
        className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
      >
        Delete
      </button>
    </li>
  );
};

export const LabelManager = ({ labels, onAdd, onUpdate, onDelete }: LabelManagerProps) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onAdd(trimmed, color);
    setName("");
  };

  return (
    <section
      aria-label="Labels"
      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      {labels.length === 0 ? (
        <p className="text-sm text-[var(--gray-text)]">No labels yet.</p>
      ) : (
        <ul className="space-y-2">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New label"
          aria-label="New label name"
          className={`${fieldClassName} w-32`}
        />
        <ColorSelect value={color} label="New label color" onChange={setColor} />
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Add label
        </button>
      </form>
    </section>
  );
};
