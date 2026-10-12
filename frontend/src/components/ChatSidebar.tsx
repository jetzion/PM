"use client";

import { useEffect, useState, type FormEvent } from "react";
import { chatApi, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const HISTORY_KEY = "pm-chat-history";

type ChatSidebarProps = {
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

const readHistory = (): ChatMessage[] => {
  const raw = sessionStorage.getItem(HISTORY_KEY);
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
    sessionStorage.removeItem(HISTORY_KEY);
    return [];
  }
};

export const ChatSidebar = ({ onClose, onBoard }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMessages(readHistory());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    const history = messages;
    setDraft("");
    setError("");
    setIsSending(true);
    setMessages([...history, { role: "user", content: message }]);

    try {
      const result = await chatApi.send(message, history);
      const nextMessages: ChatMessage[] = [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: result.message },
      ];
      setMessages(nextMessages);
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(nextMessages));
      if (result.board) {
        onBoard(result.board);
      }
    } catch {
      setMessages(history);
      setDraft(message);
      setError("Unable to reach the AI.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside
      aria-label="AI chat"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]"
    >
      <div className="shrink-0 border-b border-[var(--stroke)] px-5 py-5">
        <div className="h-1 w-10 rounded-full bg-[var(--accent-yellow)]" />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Assistant
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)]">
              AI chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
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

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-[var(--stroke)] px-5 py-4">
        {error ? (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <input
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask the AI"
          disabled={isSending}
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
