import { useEffect, useState, type FormEvent } from "react";
import type { Comment } from "@/lib/api";

export type CommentHandlers = {
  load: (cardId: string) => Promise<Comment[]>;
  add: (cardId: string, body: string) => Promise<Comment[]>;
  remove: (cardId: string, commentId: string) => Promise<Comment[]>;
  canDelete: (comment: Comment) => boolean;
};

type CommentsProps = {
  cardId: string;
  cardTitle: string;
  handlers: CommentHandlers;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const Comments = ({ cardId, cardTitle, handlers }: CommentsProps) => {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    handlers
      .load(cardId)
      .then(setComments)
      .catch(() => setError("Unable to load comments."));
    // Load once per opened card; handlers are rebuilt on every board render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const run = async (request: Promise<Comment[]>) => {
    try {
      setError("");
      setComments(await request);
    } catch {
      setError("Unable to save the comment.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }
    setDraft("");
    await run(handlers.add(cardId, body));
  };

  return (
    <div
      role="group"
      aria-label={`Comments for ${cardTitle}`}
      // Keep clicks and typing here from starting a card drag.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="mt-3 space-y-2 border-t border-[var(--stroke)] pt-3"
    >
      {comments === null && !error ? (
        <p className="text-xs text-[var(--gray-text)]">Loading comments...</p>
      ) : null}
      {comments?.length === 0 ? (
        <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
      ) : null}
      {comments?.map((comment) => (
        <article key={comment.id} className="rounded-xl bg-[var(--surface)] px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="break-all font-semibold text-[var(--navy-dark)]">{comment.author}</span>
            <time dateTime={comment.createdAt} className="whitespace-nowrap text-[var(--gray-text)]">
              {formatTime(comment.createdAt)}
            </time>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--navy-dark)]">{comment.body}</p>
          {handlers.canDelete(comment) ? (
            <button
              type="button"
              onClick={() => run(handlers.remove(cardId, comment.id))}
              aria-label={`Delete comment ${comment.body}`}
              className="mt-1 text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            >
              Delete
            </button>
          ) : null}
        </article>
      ))}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment"
          aria-label={`New comment for ${cardTitle}`}
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Comment
        </button>
      </form>
    </div>
  );
};
