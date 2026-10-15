"use client";

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { AccountPanel } from "@/components/AccountPanel";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Overview } from "@/components/Overview";
import { boardsApi, type BoardSummary, type User } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { errorMessage } from "@/lib/ui";

type WorkspaceProps = {
  user: User;
  onLogout: () => void;
  onSessionEnded: () => void;
};

const SIDEBAR_KEY = "pm-sidebar-collapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
};

const Chevron = ({ direction }: { direction: "left" | "right" }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
    <path
      d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const toggleClassName =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]";

// Holds the selected board id, or "overview".
const activeBoardKey = (userId: number) => `pm-active-board:${userId}`;

export const Workspace = ({ user, onLogout, onSessionEnded }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isOverview, setIsOverview] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  // Workspace only renders client-side (after the session check), so localStorage is available.
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  // Callback ref, so KanbanBoard re-renders with the element once it mounts.
  const [chatSlot, setChatSlot] = useState<HTMLDivElement | null>(null);

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next));
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  };
  const [error, setError] = useState("");

  useEffect(() => {
    boardsApi
      .list()
      .then((list) => {
        setBoards(list);
        const saved = localStorage.getItem(activeBoardKey(user.id));
        const initial = list.find((board) => String(board.id) === saved) ?? list[0];
        setActiveId(initial?.id ?? null);
        setIsOverview(saved === "overview");
      })
      .catch(() => setError("Unable to load your boards."));
  }, [user.id]);

  const showOverview = () => {
    setIsOverview(true);
    localStorage.setItem(activeBoardKey(user.id), "overview");
  };

  const selectBoard = (boardId: number | null) => {
    setIsOverview(false);
    setActiveId(boardId);
    if (boardId === null) {
      localStorage.removeItem(activeBoardKey(user.id));
    } else {
      localStorage.setItem(activeBoardKey(user.id), String(boardId));
    }
  };

  const updateSummary = (boardId: number, changes: Partial<BoardSummary>) =>
    setBoards((list) =>
      list?.map((board) => (board.id === boardId ? { ...board, ...changes } : board)) ?? list
    );

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name) {
      return;
    }
    try {
      setError("");
      const created = await boardsApi.create(name);
      setBoards((list) => [...(list ?? []), created]);
      setNewBoardName("");
      selectBoard(created.id);
    } catch (err) {
      setError(errorMessage(err, "Unable to create the board."));
    }
  };

  const handleRenameBoard = async (boardId: number, name: string) => {
    const renamed = await boardsApi.rename(boardId, name);
    updateSummary(boardId, { name: renamed.name });
  };

  const handleDeleteBoard = async (boardId: number) => {
    try {
      setError("");
      await boardsApi.remove(boardId);
      const remaining = (boards ?? []).filter((board) => board.id !== boardId);
      setBoards(remaining);
      selectBoard(remaining[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err, "Unable to delete the board."));
    }
  };

  const handleDuplicateBoard = async (board: BoardSummary) => {
    try {
      setError("");
      const copy = await boardsApi.duplicate(board.id, `${board.name} copy`);
      setBoards((list) => [...(list ?? []), copy]);
      selectBoard(copy.id);
    } catch (err) {
      setError(errorMessage(err, "Unable to duplicate the board."));
    }
  };

  const handleLeaveBoard = async (boardId: number) => {
    try {
      setError("");
      await boardsApi.removeMember(boardId, user.id);
      const remaining = (boards ?? []).filter((board) => board.id !== boardId);
      setBoards(remaining);
      selectBoard(remaining[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err, "Unable to leave the board."));
    }
  };

  const handleBoardChange = (boardId: number, board: BoardData) =>
    updateSummary(boardId, {
      columnCount: board.columns.length,
      cardCount: Object.keys(board.cards).length,
    });

  const activeBoard = boards?.find((board) => board.id === activeId) ?? null;
  const showChat = !isOverview && activeBoard !== null;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {isCollapsed ? (
        <aside
          aria-label="Workspace"
          className="flex shrink-0 items-center gap-3 border-b border-[var(--stroke)] bg-white/90 px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-16 lg:flex-col lg:border-b-0 lg:border-r lg:px-0 lg:py-6"
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={false}
            aria-label="Expand sidebar"
            className={toggleClassName}
          >
            <Chevron direction="right" />
          </button>
          <div className="h-1 w-6 rounded-full bg-[var(--accent-yellow)] lg:h-6 lg:w-1" />
          <p className="truncate font-display text-sm font-semibold text-[var(--navy-dark)] lg:hidden">
            {isOverview ? "Overview" : (activeBoard?.name ?? "Kanban Studio")}
          </p>
        </aside>
      ) : (
        <aside
          aria-label="Workspace"
          className="flex shrink-0 flex-col gap-6 border-b border-[var(--stroke)] bg-white/90 px-5 py-6 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="h-1 w-10 rounded-full bg-[var(--accent-yellow)]" />
              <p className="mt-3 font-display text-xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </p>
              <p className="truncate text-xs text-[var(--gray-text)]">
                Signed in as {user.username}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={true}
              aria-label="Collapse sidebar"
              className={toggleClassName}
            >
              <Chevron direction="left" />
            </button>
          </div>

          <nav
            aria-label="Boards"
            className={clsx(
              "flex min-h-0 flex-col gap-2 overflow-y-auto",
              // With a board open the chat takes the remaining height; the list shrinks and scrolls.
              showChat ? "shrink lg:max-h-[40%]" : "flex-1"
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Boards
            </p>
            <button
              type="button"
              onClick={showOverview}
              aria-current={isOverview ? "page" : undefined}
              className={clsx(
                "rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                isOverview
                  ? "bg-[var(--navy-dark)] text-white"
                  : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
              )}
            >
              Overview
            </button>
            {boards?.length === 0 ? (
              <p className="text-sm text-[var(--gray-text)]">No boards yet.</p>
            ) : null}
            {boards?.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => selectBoard(board.id)}
                aria-current={!isOverview && board.id === activeId ? "page" : undefined}
                className={clsx(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                  !isOverview && board.id === activeId
                    ? "bg-[var(--primary-blue)] text-white"
                    : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{board.name}</span>
                  {board.role === "member" ? (
                    <span
                      className={clsx(
                        "block text-[11px] font-medium",
                        !isOverview && board.id === activeId ? "text-white/80" : "text-[var(--gray-text)]"
                      )}
                    >
                      Shared by {board.owner}
                    </span>
                  ) : null}
                </span>
                <span
                  className={clsx(
                    "shrink-0 text-xs font-medium",
                    !isOverview && board.id === activeId
                      ? "text-white/80"
                      : "text-[var(--gray-text)]"
                  )}
                >
                  {board.cardCount} cards
                </span>
              </button>
            ))}
            <form onSubmit={handleCreateBoard} className="mt-2 flex gap-2">
              <input
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="New board"
                aria-label="New board name"
                className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
              >
                Create
              </button>
            </form>
            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </nav>

          {showChat ? (
            <div
              ref={setChatSlot}
              className="flex h-[26rem] min-h-0 flex-col lg:h-auto lg:min-h-[18rem] lg:flex-1"
            />
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[var(--stroke)] pt-4">
            {isAccountOpen ? <AccountPanel
                onClose={() => setIsAccountOpen(false)}
                onSessionEnded={onSessionEnded}
              /> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAccountOpen((open) => !open)}
                className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Account
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {isOverview ? (
          <Overview onOpenBoard={selectBoard} />
        ) : activeBoard ? (
          <KanbanBoard
            key={activeBoard.id}
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            onRenameBoard={(name) => handleRenameBoard(activeBoard.id, name)}
            onDeleteBoard={() => handleDeleteBoard(activeBoard.id)}
            onDuplicateBoard={() => handleDuplicateBoard(activeBoard)}
            onLeaveBoard={() => handleLeaveBoard(activeBoard.id)}
            role={activeBoard.role}
            owner={activeBoard.owner}
            username={user.username}
            chatSlot={chatSlot}
            onBoardChange={(board) => handleBoardChange(activeBoard.id, board)}
          />
        ) : boards ? (
          <main className="flex min-h-[60vh] items-center justify-center px-6 py-12">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Create a board to get started.
            </p>
          </main>
        ) : null}
      </div>
    </div>
  );
};
