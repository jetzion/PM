"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { boardApi } from "@/lib/api";
import { moveCard, type BoardData, type Card } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    let isMounted = true;

    boardApi
      .getBoard()
      .then((nextBoard) => {
        if (isMounted) {
          setBoard(nextBoard);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Unable to load the board.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const applyBoardChange = async (request: () => Promise<BoardData>) => {
    try {
      setError("");
      setBoard(await request());
    } catch {
      setError("Unable to save the board change.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const nextColumns = moveCard(
      board.columns,
      active.id as string,
      over.id as string
    );
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(active.id as string)
    );

    if (!targetColumn) {
      return;
    }

    applyBoardChange(() =>
      boardApi.moveCard(
        active.id as string,
        targetColumn.id,
        targetColumn.cardIds.indexOf(active.id as string)
      )
    );
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    applyBoardChange(() => boardApi.renameColumn(columnId, title));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    applyBoardChange(() =>
      boardApi.addCard(columnId, title, details || "No details yet.")
    );
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    applyBoardChange(() => boardApi.updateCard(cardId, title, details));
  };

  const handleDeleteCard = (_columnId: string, cardId: string) => {
    applyBoardChange(() => boardApi.deleteCard(cardId));
  };

  const handleAddColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) {
      return;
    }
    setNewColumnTitle("");
    applyBoardChange(() => boardApi.addColumn(title));
  };

  const handleDeleteColumn = (columnId: string) => {
    applyBoardChange(() => boardApi.deleteColumn(columnId));
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          {error || "Loading board..."}
        </p>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative flex flex-col gap-10 px-6 pb-16 pt-12">
        <header className="grid w-full items-start gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch">
          <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 sm:items-end">
              <div className="flex items-center gap-3">
                {!isChatOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                  >
                    Open chat
                  </button>
                ) : null}
                {onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  >
                    Log out
                  </button>
                ) : null}
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. {board.columns.length} columns. Persisted.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
            <form onSubmit={handleAddColumn} className="flex items-center gap-2">
              <input
                value={newColumnTitle}
                onChange={(event) => setNewColumnTitle(event.target.value)}
                placeholder="New column"
                aria-label="New column title"
                className="w-36 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
              >
                Add column
              </button>
            </form>
          </div>
          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          </div>
          {isChatOpen ? (
            <div className="h-80 min-h-0">
              <ChatSidebar
                onClose={() => setIsChatOpen(false)}
                onBoard={(nextBoard) => {
                  setError("");
                  setBoard(nextBoard);
                }}
              />
            </div>
          ) : null}
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-6 overflow-x-auto">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter((card): card is Card => Boolean(card))}
                onRename={handleRenameColumn}
                onDeleteColumn={handleDeleteColumn}
                onAddCard={handleAddCard}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
