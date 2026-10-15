import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/ui";

type BoardHeaderProps = {
  name: string;
  columnCount: number;
  cardCount: number;
  /** Null when the board has no done column. */
  doneCount: number | null;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Members cannot rename or delete; they can leave instead. */
  isOwner: boolean;
  owner: string;
  onLeave: () => void;
};

const quietButton =
  "rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

export const BoardHeader = ({
  name,
  columnCount,
  cardCount,
  doneCount,
  onRename,
  onDelete,
  onDuplicate,
  isOwner,
  owner,
  onLeave,
}: BoardHeaderProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = draft?.trim();
    if (!nextName || nextName === name) {
      setDraft(null);
      return;
    }
    try {
      await onRename(nextName);
      setDraft(null);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Unable to rename the board."));
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
        {isOwner ? "Project board" : `Shared by ${owner}`}
      </p>
      {draft === null ? (
        <h1 className="mt-3 break-words font-display text-4xl font-semibold text-[var(--navy-dark)]">
          {name}
        </h1>
      ) : (
        <form onSubmit={handleRename} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setDraft(null)}
            aria-label="Board name"
            autoFocus
            className="min-w-0 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 font-display text-2xl font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Save name
          </button>
          <button type="button" onClick={() => setDraft(null)} className={quietButton}>
            Cancel
          </button>
        </form>
      )}
      <p className="mt-3 text-sm font-semibold text-[var(--primary-blue)]">
        {columnCount} columns, {cardCount} cards
        {doneCount !== null ? `, ${doneCount} done` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isOwner && draft === null ? (
          <button type="button" onClick={() => setDraft(name)} className={quietButton}>
            Rename board
          </button>
        ) : null}
        <button type="button" onClick={onDuplicate} className={quietButton}>
          Duplicate board
        </button>
        {isConfirming ? (
          <>
            <span className="text-xs font-semibold text-red-700">
              {isOwner
                ? "Delete this board and all its cards?"
                : "Leave this board? The owner can add you back."}
            </span>
            <button
              type="button"
              onClick={isOwner ? onDelete : onLeave}
              className="rounded-full bg-red-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
            >
              {isOwner ? "Confirm delete" : "Confirm leave"}
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} className={quietButton}>
              Keep board
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setIsConfirming(true)} className={quietButton}>
            {isOwner ? "Delete board" : "Leave board"}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
};
