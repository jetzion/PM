import clsx from "clsx";
import type { Label, LabelColor } from "@/lib/kanban";

export const labelColorClass: Record<LabelColor, string> = {
  yellow: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  blue: "bg-[var(--primary-blue)] text-white",
  purple: "bg-[var(--secondary-purple)] text-white",
  navy: "bg-[var(--navy-dark)] text-white",
  gray: "bg-[var(--gray-text)] text-white",
};

export const LabelChip = ({ label }: { label: Label }) => (
  <span
    data-label-color={label.color}
    className={clsx(
      "rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal",
      labelColorClass[label.color]
    )}
  >
    {label.name}
  </span>
);
