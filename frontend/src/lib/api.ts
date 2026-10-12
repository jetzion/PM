import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board: BoardData | null;
};

const requestJson = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
};

const requestBoard = (path: string, options: RequestInit = {}) =>
  requestJson<BoardData>(path, options);

export const boardApi = {
  getBoard: () => requestBoard("/api/board"),
  replaceBoard: (board: BoardData) =>
    requestBoard("/api/board", {
      method: "PUT",
      body: JSON.stringify(board),
    }),
  addColumn: (title: string) =>
    requestBoard("/api/columns", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  renameColumn: (columnId: string, title: string) =>
    requestBoard(`/api/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteColumn: (columnId: string) =>
    requestBoard(`/api/columns/${columnId}`, { method: "DELETE" }),
  addCard: (columnId: string, title: string, details: string) =>
    requestBoard("/api/cards", {
      method: "POST",
      body: JSON.stringify({ columnId, title, details }),
    }),
  updateCard: (cardId: string, title: string, details: string) =>
    requestBoard(`/api/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, details }),
    }),
  deleteCard: (cardId: string) =>
    requestBoard(`/api/cards/${cardId}`, { method: "DELETE" }),
  moveCard: (cardId: string, columnId: string, position: number) =>
    requestBoard(`/api/cards/${cardId}/move`, {
      method: "POST",
      body: JSON.stringify({ columnId, position }),
    }),
};

export const chatApi = {
  send: (message: string, history: ChatMessage[]) =>
    requestJson<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};
