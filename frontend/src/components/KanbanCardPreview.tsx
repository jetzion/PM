import { CardMeta } from "@/components/CardMeta";
import type { Card, Label } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
  labels: Label[];
  isDone: boolean;
};

export const KanbanCardPreview = ({ card, labels, isDone }: KanbanCardPreviewProps) => (
  <article className="rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          {card.details}
        </p>
        <CardMeta card={card} labels={labels} isDone={isDone} />
      </div>
    </div>
  </article>
);
