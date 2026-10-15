import { useState, type FormEvent } from "react";
import type { ChecklistItem } from "@/lib/kanban";

export type ChecklistHandlers = {
  add: (cardId: string, text: string) => void;
  toggle: (cardId: string, itemId: string, done: boolean) => void;
  remove: (cardId: string, itemId: string) => void;
};

type ChecklistProps = {
  cardId: string;
  cardTitle: string;
  items: ChecklistItem[];
  handlers: ChecklistHandlers;
};

export const Checklist = ({ cardId, cardTitle, items, handlers }: ChecklistProps) => {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    handlers.add(cardId, trimmed);
    setText("");
  };

  return (
    <div
      aria-label={`Checklist for ${cardTitle}`}
      role="group"
      // Keep clicks and typing here from starting a card drag.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="mt-3 space-y-1.5 border-t border-[var(--stroke)] pt-3"
    >
      {items.map((item) => (
        <div key={item.id} className="group flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={item.done}
            onChange={(event) => handlers.toggle(cardId, item.id, event.target.checked)}
            aria-label={item.text}
            className="mt-1 accent-[var(--secondary-purple)]"
          />
          <span
            className={
              item.done
                ? "flex-1 text-[var(--gray-text)] line-through"
                : "flex-1 text-[var(--navy-dark)]"
            }
          >
            {item.text}
          </span>
          <button
            type="button"
            onClick={() => handlers.remove(cardId, item.id)}
            aria-label={`Remove checklist item ${item.text}`}
            className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          >
            x
          </button>
        </div>
      ))}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add an item"
          aria-label={`New checklist item for ${cardTitle}`}
          className="min-w-0 flex-1 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--secondary-purple)] px-2 py-1 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Add
        </button>
      </form>
    </div>
  );
};
