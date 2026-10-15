import clsx from "clsx";
import { LabelChip } from "@/components/LabelChip";
import {
  dueStatus,
  formatDueDate,
  toIsoDate,
  type Card,
  type Label,
  type Priority,
} from "@/lib/kanban";

// Navy text on the two light steps and white on the dark one keep every badge at 4.5:1 or better.
export const priorityStyles: Record<Priority, string> = {
  high: "bg-[var(--priority-high)] text-white",
  medium: "bg-[var(--priority-medium)] text-[var(--navy-dark)]",
  low: "bg-[var(--priority-low)] text-[var(--navy-dark)]",
};

const dueLabels = { done: "Done, was due", overdue: "Overdue", today: "Due today", upcoming: "Due" };

type CardMetaProps = {
  card: Card;
  labels: Label[];
  isDone?: boolean;
};

export const CardMeta = ({ card, labels, isDone = false }: CardMetaProps) => {
  const status = card.dueDate ? dueStatus(card.dueDate, toIsoDate(new Date()), isDone) : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
      <span className={clsx("rounded-full px-2 py-0.5", priorityStyles[card.priority])}>
        {card.priority} priority
      </span>
      {card.dueDate && status ? (
        <span
          data-due-status={status}
          className={clsx(
            "rounded-full px-2 py-0.5",
            status === "overdue" && "bg-red-50 text-red-700",
            status === "today" && "bg-[var(--accent-yellow)]/20 text-[var(--navy-dark)]",
            (status === "upcoming" || status === "done") && "text-[var(--gray-text)]"
          )}
        >
          {dueLabels[status]} {formatDueDate(card.dueDate)}
        </span>
      ) : null}
      {card.checklist.length > 0 ? (
        <span
          data-checklist-progress
          className="rounded-full border border-[var(--stroke)] px-2 py-0.5 text-[var(--navy-dark)]"
        >
          {card.checklist.filter((item) => item.done).length}/{card.checklist.length} done
        </span>
      ) : null}
      {labels
        .filter((label) => card.labelIds.includes(label.id))
        .map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
    </div>
  );
};
