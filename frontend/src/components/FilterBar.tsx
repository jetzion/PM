import {
  PRIORITIES,
  emptyFilter,
  isFilterActive,
  type CardFilter,
  type Label,
} from "@/lib/kanban";

type FilterBarProps = {
  filter: CardFilter;
  labels: Label[];
  visibleCount: number;
  totalCount: number;
  onChange: (filter: CardFilter) => void;
};

const fieldClassName =
  "rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const FilterBar = ({ filter, labels, visibleCount, totalCount, onChange }: FilterBarProps) => {
  const update = (changes: Partial<CardFilter>) => onChange({ ...filter, ...changes });

  return (
    <section aria-label="Filter cards" className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={filter.text}
        onChange={(event) => update({ text: event.target.value })}
        placeholder="Search cards"
        aria-label="Search cards"
        className={`${fieldClassName} w-48`}
      />
      <select
        value={filter.priority}
        onChange={(event) => update({ priority: event.target.value as CardFilter["priority"] })}
        aria-label="Filter by priority"
        className={fieldClassName}
      >
        <option value="any">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority[0].toUpperCase() + priority.slice(1)} priority
          </option>
        ))}
      </select>
      {labels.length > 0 ? (
        <select
          value={filter.labelId}
          onChange={(event) => update({ labelId: event.target.value })}
          aria-label="Filter by label"
          className={fieldClassName}
        >
          <option value="">Any label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      ) : null}
      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--navy-dark)]">
        <input
          type="checkbox"
          checked={filter.overdueOnly}
          onChange={(event) => update({ overdueOnly: event.target.checked })}
          className="accent-[var(--secondary-purple)]"
        />
        Overdue only
      </label>
      {isFilterActive(filter) ? (
        <>
          <span role="status" className="text-xs font-semibold text-[var(--primary-blue)]">
            Showing {visibleCount} of {totalCount} cards
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          >
            Clear filters
          </button>
        </>
      ) : null}
    </section>
  );
};
