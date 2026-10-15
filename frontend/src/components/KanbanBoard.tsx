"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
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
import { BoardHeader } from "@/components/BoardHeader";
import { FilterBar } from "@/components/FilterBar";
import { LabelManager } from "@/components/LabelManager";
import { MembersPanel } from "@/components/MembersPanel";
import { boardApi, type Comment } from "@/lib/api";
import {
  cardMatches,
  emptyFilter,
  isFilterActive,
  moveCard,
  toIsoDate,
  type BoardData,
  type CardFields,
  type CardFilter,
  type LabelColor,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: number;
  boardName: string;
  onRenameBoard: (name: string) => Promise<void>;
  onDeleteBoard: () => void;
  onDuplicateBoard: () => void;
  onLeaveBoard: () => void;
  role: "owner" | "member";
  owner: string;
  /** The signed-in user, to decide which comments they may delete. */
  username: string;
  onBoardChange?: (board: BoardData) => void;
  /** Sidebar element the chat renders into. No chat when null (e.g. collapsed sidebar). */
  chatSlot: HTMLElement | null;
};

export const KanbanBoard = ({
  boardId,
  boardName,
  onRenameBoard,
  onDeleteBoard,
  onDuplicateBoard,
  onLeaveBoard,
  role,
  owner,
  username,
  onBoardChange,
  chatSlot,
}: KanbanBoardProps) => {
  const [board, setBoardState] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isLabelsOpen, setIsLabelsOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(emptyFilter);
  const api = useMemo(() => boardApi(boardId), [boardId]);

  const setBoard = (next: BoardData) => {
    setBoardState(next);
    onBoardChange?.(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    let isMounted = true;

    api
      .get()
      .then((nextBoard) => {
        if (isMounted) {
          setBoardState(nextBoard);
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
  }, [api]);

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

    const cardId = active.id as string;
    const nextColumns = moveCard(board.columns, cardId, over.id as string);
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(cardId)
    );

    if (!targetColumn) {
      return;
    }

    applyBoardChange(() =>
      api.moveCard(cardId, targetColumn.id, targetColumn.cardIds.indexOf(cardId))
    );
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    applyBoardChange(() => api.renameColumn(columnId, title));
  };

  const handleAddCard = (columnId: string, fields: CardFields) => {
    applyBoardChange(() =>
      api.addCard(columnId, { ...fields, details: fields.details || "No details yet." })
    );
  };

  const handleUpdateCard = (cardId: string, fields: CardFields) => {
    applyBoardChange(() => api.updateCard(cardId, fields));
  };

  const handleDeleteCard = (cardId: string) => {
    applyBoardChange(() => api.deleteCard(cardId));
  };

  const handleAddColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) {
      return;
    }
    setNewColumnTitle("");
    applyBoardChange(() => api.addColumn(title));
  };

  const handleAddLabel = (name: string, color: LabelColor) => {
    applyBoardChange(() => api.addLabel(name, color));
  };

  const handleUpdateLabel = (labelId: string, changes: { name?: string; color?: LabelColor }) => {
    applyBoardChange(() => api.updateLabel(labelId, changes));
  };

  const handleDeleteLabel = (labelId: string) => {
    applyBoardChange(() => api.deleteLabel(labelId));
  };

  const checklistHandlers = {
    add: (cardId: string, text: string) =>
      applyBoardChange(() => api.addChecklistItem(cardId, text)),
    toggle: (cardId: string, itemId: string, done: boolean) =>
      applyBoardChange(() => api.updateChecklistItem(cardId, itemId, { done })),
    remove: (cardId: string, itemId: string) =>
      applyBoardChange(() => api.deleteChecklistItem(cardId, itemId)),
  };

  // Comment routes return the card's comments, not the board, so the card's
  // commentCount is patched locally from the returned list.
  const syncCommentCount = (cardId: string) => (comments: Comment[]) => {
    setBoardState((current) =>
      current && current.cards[cardId]
        ? {
            ...current,
            cards: {
              ...current.cards,
              [cardId]: { ...current.cards[cardId], commentCount: comments.length },
            },
          }
        : current
    );
    return comments;
  };

  const commentHandlers = {
    load: (cardId: string) => api.listComments(cardId),
    add: (cardId: string, body: string) =>
      api.addComment(cardId, body).then(syncCommentCount(cardId)),
    remove: (cardId: string, commentId: string) =>
      api.deleteComment(cardId, commentId).then(syncCommentCount(cardId)),
    // Mirrors the API: authors and the board owner can delete a comment.
    canDelete: (comment: Comment) => role === "owner" || comment.author === username,
  };

  const handleToggleDone = (columnId: string) => {
    const next = board?.doneColumnId === columnId ? null : columnId;
    applyBoardChange(() => api.setDoneColumn(next));
  };

  const handleDeleteColumn = (columnId: string) => {
    applyBoardChange(() => api.deleteColumn(columnId));
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          {error || "Loading board..."}
        </p>
      </main>
    );
  }

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const today = toIsoDate(new Date());
  const visibleCards = (columnId: string, cardIds: string[]) =>
    cardIds
      .map((cardId) => board.cards[cardId])
      .filter((card) => cardMatches(card, filter, today, columnId === board.doneColumnId));
  const doneCount =
    board.columns.find((column) => column.id === board.doneColumnId)?.cardIds.length ?? 0;
  const totalCount = Object.keys(board.cards).length;
  const visibleCount = board.columns.reduce(
    (count, column) => count + visibleCards(column.id, column.cardIds).length,
    0
  );

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative flex flex-col gap-10 px-6 pb-16 pt-12">
        <header className="grid w-full items-start gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <BoardHeader
                name={boardName}
                columnCount={board.columns.length}
                cardCount={Object.keys(board.cards).length}
                doneCount={board.doneColumnId ? doneCount : null}
                onRename={onRenameBoard}
                onDelete={onDeleteBoard}
                onDuplicate={onDuplicateBoard}
                isOwner={role === "owner"}
                owner={owner}
                onLeave={onLeaveBoard}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
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
              <button
                type="button"
                onClick={() => setIsLabelsOpen((open) => !open)}
                aria-expanded={isLabelsOpen}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                {isLabelsOpen ? "Hide labels" : `Labels (${board.labels.length})`}
              </button>
              <button
                type="button"
                onClick={() => setIsMembersOpen((open) => !open)}
                aria-expanded={isMembersOpen}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                {isMembersOpen ? "Hide members" : "Members"}
              </button>
            </div>
            {isMembersOpen ? <MembersPanel boardId={boardId} isOwner={role === "owner"} /> : null}
            {isLabelsOpen ? (
              <LabelManager
                labels={board.labels}
                onAdd={handleAddLabel}
                onUpdate={handleUpdateLabel}
                onDelete={handleDeleteLabel}
              />
            ) : null}
            {error ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        </header>
        {/* The chat lives in the sidebar but stays here so it can swap in AI-updated boards. */}
        {chatSlot
          ? createPortal(
              isChatOpen ? (
                <ChatSidebar
                  boardId={boardId}
                  onClose={() => setIsChatOpen(false)}
                  onBoard={(nextBoard) => {
                    setError("");
                    setBoard(nextBoard);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="w-full rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                >
                  Open chat
                </button>
              ),
              chatSlot
            )
          : null}

        <FilterBar
          filter={filter}
          labels={board.labels}
          visibleCount={visibleCount}
          totalCount={totalCount}
          onChange={setFilter}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-6 overflow-x-auto pb-4">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={visibleCards(column.id, column.cardIds)}
                boardLabels={board.labels}
                isFiltered={isFilterActive(filter)}
                isDoneColumn={column.id === board.doneColumnId}
                onToggleDone={handleToggleDone}
                checklistHandlers={checklistHandlers}
                commentHandlers={commentHandlers}
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
                <KanbanCardPreview
                  card={activeCard}
                  labels={board.labels}
                  isDone={board.columns.some(
                    (column) =>
                      column.id === board.doneColumnId && column.cardIds.includes(activeCard.id)
                  )}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
