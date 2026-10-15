import { useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardFields, Column, Label } from "@/lib/kanban";
import type { ChecklistHandlers } from "@/components/Checklist";
import type { CommentHandlers } from "@/components/Comments";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  boardLabels: Label[];
  isFiltered?: boolean;
  isDoneColumn?: boolean;
  onToggleDone: (columnId: string) => void;
  checklistHandlers: ChecklistHandlers;
  commentHandlers: CommentHandlers;
  onRename: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddCard: (columnId: string, fields: CardFields) => void;
  onUpdateCard: (cardId: string, fields: CardFields) => void;
  onDeleteCard: (cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  boardLabels,
  isFiltered = false,
  isDoneColumn = false,
  onToggleDone,
  checklistHandlers,
  commentHandlers,
  onRename,
  onDeleteColumn,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const [title, setTitle] = useState(column.title);
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const commitTitle = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(column.title);
      return;
    }
    if (nextTitle !== column.title) {
      onRename(column.id, nextTitle);
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setTitle(column.title);
      event.currentTarget.blur();
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex h-full min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} cards
            </span>
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => onToggleDone(column.id)}
          aria-pressed={isDoneColumn}
          aria-label={`Done column: ${column.title}`}
          title={isDoneColumn ? "Cards here count as done" : "Mark this as the done column"}
          className={clsx(
            "rounded-full px-2 py-1 text-xs font-semibold transition",
            isDoneColumn
              ? "bg-[var(--navy-dark)] text-white"
              : "border border-transparent text-[var(--gray-text)] hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          )}
        >
          {isDoneColumn ? "Done column" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={() => onDeleteColumn(column.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete column ${column.title}`}
        >
          Delete
        </button>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              boardLabels={boardLabels}
              isDone={isDoneColumn}
              checklistHandlers={checklistHandlers}
              commentHandlers={commentHandlers}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {isFiltered ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      <NewCardForm
        boardLabels={boardLabels}
        onAdd={(fields) => onAddCard(column.id, fields)}
      />
    </section>
  );
};
