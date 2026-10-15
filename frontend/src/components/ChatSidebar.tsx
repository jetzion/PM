"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { boardApi, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { errorMessage } from "@/lib/ui";

export const historyKey = (boardId: number) => `pm-chat-history:${boardId}`;

type ChatSidebarProps = {
  boardId: number;
  onClose: () => void;
  onBoard: (board: BoardData) => void;
};

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as ChatMessage;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
};

const readHistory = (key: string): ChatMessage[] => {
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isChatMessage);
  } catch {
    sessionStorage.removeItem(key);
    return [];
  }
};

export const ChatSidebar = ({ boardId, onClose, onBoard }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (or "Thinking...") in view. Scrolling the list itself,
  // not scrollIntoView, so the page does not jump.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMessages(readHistory(historyKey(boardId)));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [boardId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    const history = messages;
    const withUserMessage: ChatMessage[] = [
      ...history,
      { role: "user", content: message },
    ];
    setDraft("");
    setError("");
    setIsSending(true);
    setMessages(withUserMessage);

    try {
      const result = await boardApi(boardId).chat(message, history);
      const nextMessages: ChatMessage[] = [
        ...withUserMessage,
        { role: "assistant", content: result.message },
      ];
      setMessages(nextMessages);
      sessionStorage.setItem(historyKey(boardId), JSON.stringify(nextMessages));
      if (result.board) {
        onBoard(result.board);
      }
    } catch (err) {
      setMessages(history);
      setDraft(message);
      // The backend explains known failures (out of credits, rate limit, timeout).
      setError(errorMessage(err, "Unable to reach the AI."));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside
      aria-label="AI chat"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--stroke)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-[var(--accent-yellow)]" />
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">AI chat</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Close
        </button>
      </div>

      <div
        ref={listRef}
        data-testid="chat-messages"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask the AI to add, edit, move, or delete cards and columns.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "self-end rounded-2xl bg-[var(--primary-blue)] px-4 py-3 text-sm leading-6 text-white"
                : "self-start rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </p>
        ))}
        {isSending ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Thinking...
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-[var(--stroke)] px-4 py-3">
        {error ? (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <div className="flex gap-2">
          <input
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask the AI"
            disabled={isSending}
            className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            className="shrink-0 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
};
