"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { overviewApi, type BoardStats, type Overview as OverviewData } from "@/lib/api";
import { dueStatus, formatDueDate, toIsoDate, type Priority } from "@/lib/kanban";

type OverviewProps = {
  onOpenBoard: (boardId: number) => void;
};

// High first so the most important share reads first; colors are the priority ramp tokens.
const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];
const PRIORITY_FILL: Record<Priority, string> = {
  high: "bg-[var(--priority-high)]",
  medium: "bg-[var(--priority-medium)]",
  low: "bg-[var(--priority-low)]",
};
const PRIORITY_NAME: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
// The server leaves done cards out of dueSoon; "done" is here only to cover DueStatus.
const DUE_TEXT = { done: "Done", overdue: "Overdue", today: "Due today", upcoming: "Due" };

const sectionClassName =
  "rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur";
const eyebrowClassName =
  "text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]";

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-[var(--stroke)] bg-white px-5 py-4">
    <p className={eyebrowClassName}>{label}</p>
    <p className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">{value}</p>
  </div>
);

const PriorityBar = ({ board }: { board: BoardStats }) => {
  const segments = PRIORITY_ORDER.filter((priority) => board.priorities[priority] > 0);
  const summary = PRIORITY_ORDER.map(
    (priority) => `${board.priorities[priority]} ${priority}`
  ).join(", ");

  return (
    <div>
      <div role="img" aria-label={`Priority mix: ${summary}`} className="flex h-3 w-full gap-[2px]">
        {segments.map((priority, index) => (
          <div
            key={priority}
            data-priority={priority}
            title={`${PRIORITY_NAME[priority]}: ${board.priorities[priority]} cards`}
            style={{ width: `${(board.priorities[priority] / board.cardCount) * 100}%` }}
            className={clsx(
              "h-full",
              PRIORITY_FILL[priority],
              index === segments.length - 1 && "rounded-r-[4px]"
            )}
          />
        ))}
      </div>
      {/* The legend doubles as the table view: every count is visible as text. */}
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--gray-text)]">
        {PRIORITY_ORDER.map((priority) => (
          <li key={priority} className="flex items-center gap-1.5">
            <span className={clsx("h-2.5 w-2.5 rounded-sm", PRIORITY_FILL[priority])} />
            {PRIORITY_NAME[priority]}{" "}
            <span className="font-semibold text-[var(--navy-dark)]">
              {board.priorities[priority]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const Overview = ({ onOpenBoard }: OverviewProps) => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    overviewApi
      .get(toIsoDate(new Date()))
      .then(setData)
      .catch(() => setError("Unable to load the overview."));
  }, []);

  if (!data) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          {error || "Loading overview..."}
        </p>
      </main>
    );
  }

  const total = (pick: (board: BoardStats) => number) =>
    data.boards.reduce((sum, board) => sum + pick(board), 0);

  return (
    <main className="flex flex-col gap-8 px-6 pb-16 pt-12">
      <section className={sectionClassName}>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Workspace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Overview
        </h1>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Boards" value={data.boards.length} />
          <StatTile label="Cards" value={total((board) => board.cardCount)} />
          <StatTile label="Overdue" value={total((board) => board.overdueCount)} />
          <StatTile label="High priority" value={total((board) => board.priorities.high)} />
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Board summaries" className={sectionClassName}>
          <h2 className={eyebrowClassName}>Boards</h2>
          {data.boards.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-text)]">No boards yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--stroke)]">
              {data.boards.map((board) => (
                <li key={board.id} className="py-4" data-testid={`overview-board-${board.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenBoard(board.id)}
                      className="font-display text-lg font-semibold text-[var(--navy-dark)] hover:text-[var(--primary-blue)]"
                    >
                      {board.name}
                    </button>
                    <p className="text-xs font-semibold text-[var(--gray-text)]">
                      {board.cardCount} cards, {board.doneCount} done
                      {board.overdueCount > 0 ? (
                        <span className="text-red-700"> - {board.overdueCount} overdue</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="mt-3">
                    {board.cardCount > 0 ? (
                      <PriorityBar board={board} />
                    ) : (
                      <p className="text-xs text-[var(--gray-text)]">No cards yet.</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Due soon" className={sectionClassName}>
          <h2 className={eyebrowClassName}>Due soon</h2>
          {data.dueSoon.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-text)]">
              Nothing overdue or due in the next 7 days.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.dueSoon.map((card) => {
                const status = dueStatus(card.dueDate, data.today);
                return (
                  <li key={`${card.boardId}-${card.cardId}`}>
                    <button
                      type="button"
                      onClick={() => onOpenBoard(card.boardId)}
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-left transition hover:border-[var(--primary-blue)]"
                    >
                      <span className="block text-sm font-semibold text-[var(--navy-dark)]">
                        {card.title}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--gray-text)]">
                        {card.boardName} / {card.columnTitle}
                      </span>
                      <span
                        data-due-status={status}
                        className={clsx(
                          "mt-1 block text-xs font-semibold",
                          status === "overdue" ? "text-red-700" : "text-[var(--navy-dark)]"
                        )}
                      >
                        {DUE_TEXT[status]} {formatDueDate(card.dueDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
};
