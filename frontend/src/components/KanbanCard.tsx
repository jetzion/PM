import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardFieldInputs } from "@/components/CardFieldInputs";
import { CardMeta } from "@/components/CardMeta";
import { Checklist, type ChecklistHandlers } from "@/components/Checklist";
import { Comments, type CommentHandlers } from "@/components/Comments";
import type { Card, CardFields, Label } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  boardLabels: Label[];
  isDone?: boolean;
  checklistHandlers: ChecklistHandlers;
  commentHandlers: CommentHandlers;
  onUpdate: (cardId: string, fields: CardFields) => void;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({
  card,
  boardLabels,
  isDone = false,
  checklistHandlers,
  commentHandlers,
  onUpdate,
  onDelete,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const toFormState = () => ({
    title: card.title,
    details: card.details,
    priority: card.priority,
    dueDate: card.dueDate ?? "",
    labelIds: card.labelIds,
  });
  const [formState, setFormState] = useState(toFormState);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = formState.title.trim();
    if (!title) {
      return;
    }
    onUpdate(card.id, {
      title,
      details: formState.details.trim(),
      priority: formState.priority,
      dueDate: formState.dueDate || null,
      labelIds: formState.labelIds,
    });
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          onPointerDown={(event) => event.stopPropagation()}
          className="space-y-3"
        >
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            aria-label={`Edit title for ${card.title}`}
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            aria-label={`Edit details for ${card.title}`}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <CardFieldInputs
            priority={formState.priority}
            dueDate={formState.dueDate}
            labelIds={formState.labelIds}
            boardLabels={boardLabels}
            labelSuffix={` for ${card.title}`}
            onChange={(changes) => setFormState((prev) => ({ ...prev, ...changes }))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
            <CardMeta card={card} labels={boardLabels} isDone={isDone} />
            <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setIsChecklistOpen((open) => !open)}
              aria-expanded={isChecklistOpen}
              aria-label={`Checklist for ${card.title}`}
              className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
            >
              {isChecklistOpen
                ? "Hide checklist"
                : card.checklist.length > 0
                  ? "Show checklist"
                  : "Add checklist"}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setIsCommentsOpen((open) => !open)}
              aria-expanded={isCommentsOpen}
              aria-label={`Comments for ${card.title}`}
              className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
            >
              {isCommentsOpen ? "Hide comments" : `Comments (${card.commentCount})`}
            </button>
            </div>
            {isChecklistOpen ? (
              <Checklist
                cardId={card.id}
                cardTitle={card.title}
                items={card.checklist}
                handlers={checklistHandlers}
              />
            ) : null}
            {isCommentsOpen ? (
              <Comments cardId={card.id} cardTitle={card.title} handlers={commentHandlers} />
            ) : null}
          </div>
          <div
            onPointerDown={(event) => event.stopPropagation()}
            className="flex shrink-0 flex-col gap-2"
          >
            <button
              type="button"
              onClick={() => {
                setFormState(toFormState());
                setIsEditing(true);
              }}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Delete ${card.title}`}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
