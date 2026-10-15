import type { BoardData, CardFields, LabelColor, Priority } from "@/lib/kanban";

export type User = {
  id: number;
  username: string;
};

export type BoardSummary = {
  id: number;
  name: string;
  createdAt: string;
  columnCount: number;
  cardCount: number;
  role: "owner" | "member";
  /** Username of the board's owner. */
  owner: string;
};

export type Member = {
  id: number;
  username: string;
  role: "owner" | "member";
};

export type BoardStats = {
  id: number;
  name: string;
  cardCount: number;
  overdueCount: number;
  doneCount: number;
  priorities: Record<Priority, number>;
};

export type DueCard = {
  boardId: number;
  boardName: string;
  cardId: string;
  title: string;
  dueDate: string;
  priority: Priority;
  columnTitle: string;
};

export type Overview = {
  today: string;
  boards: BoardStats[];
  dueSoon: DueCard[];
};

export type Comment = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board: BoardData | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const requestJson = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(response.status, detail ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
};

const send = <T>(path: string, method: string, body?: unknown) =>
  requestJson<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const authApi = {
  me: () => requestJson<User>("/api/auth/me"),
  login: (username: string, password: string) =>
    send<User>("/api/auth/login", "POST", { username, password }),
  register: (username: string, password: string) =>
    send<User>("/api/auth/register", "POST", { username, password }),
  logout: () => send<void>("/api/auth/logout", "POST"),
  changePassword: (currentPassword: string, newPassword: string) =>
    send<void>("/api/auth/password", "PUT", { currentPassword, newPassword }),
  logoutAll: () => send<void>("/api/auth/logout-all", "POST"),
  deleteAccount: (password: string) =>
    send<void>("/api/auth/delete-account", "POST", { password }),
};

export const boardsApi = {
  list: () => requestJson<BoardSummary[]>("/api/boards"),
  create: (name: string) => send<BoardSummary>("/api/boards", "POST", { name }),
  rename: (boardId: number, name: string) =>
    send<BoardSummary>(`/api/boards/${boardId}`, "PATCH", { name }),
  remove: (boardId: number) => send<void>(`/api/boards/${boardId}`, "DELETE"),
  members: (boardId: number) => requestJson<Member[]>(`/api/boards/${boardId}/members`),
  addMember: (boardId: number, username: string) =>
    send<Member[]>(`/api/boards/${boardId}/members`, "POST", { username }),
  removeMember: (boardId: number, userId: number) =>
    send<Member[]>(`/api/boards/${boardId}/members/${userId}`, "DELETE"),
  duplicate: (boardId: number, name: string) =>
    send<BoardSummary>(`/api/boards/${boardId}/duplicate`, "POST", { name }),
};

export const overviewApi = {
  get: (today: string) => requestJson<Overview>(`/api/overview?today=${today}`),
};

export const boardApi = (boardId: number) => {
  const base = `/api/boards/${boardId}`;
  return {
    get: () => requestJson<BoardData>(base),
    replace: (board: BoardData) => send<BoardData>(base, "PUT", board),
    addColumn: (title: string) => send<BoardData>(`${base}/columns`, "POST", { title }),
    renameColumn: (columnId: string, title: string) =>
      send<BoardData>(`${base}/columns/${columnId}`, "PATCH", { title }),
    deleteColumn: (columnId: string) =>
      send<BoardData>(`${base}/columns/${columnId}`, "DELETE"),
    setDoneColumn: (columnId: string | null) =>
      send<BoardData>(`${base}/done-column`, "PUT", { columnId }),
    addCard: (columnId: string, fields: CardFields) =>
      send<BoardData>(`${base}/cards`, "POST", { columnId, ...fields }),
    updateCard: (cardId: string, fields: Partial<CardFields>) =>
      send<BoardData>(`${base}/cards/${cardId}`, "PATCH", fields),
    deleteCard: (cardId: string) => send<BoardData>(`${base}/cards/${cardId}`, "DELETE"),
    moveCard: (cardId: string, columnId: string, position: number) =>
      send<BoardData>(`${base}/cards/${cardId}/move`, "POST", { columnId, position }),
    listComments: (cardId: string) => requestJson<Comment[]>(`${base}/cards/${cardId}/comments`),
    addComment: (cardId: string, body: string) =>
      send<Comment[]>(`${base}/cards/${cardId}/comments`, "POST", { body }),
    deleteComment: (cardId: string, commentId: string) =>
      send<Comment[]>(`${base}/cards/${cardId}/comments/${commentId}`, "DELETE"),
    addChecklistItem: (cardId: string, text: string) =>
      send<BoardData>(`${base}/cards/${cardId}/checklist`, "POST", { text }),
    updateChecklistItem: (cardId: string, itemId: string, changes: { text?: string; done?: boolean }) =>
      send<BoardData>(`${base}/cards/${cardId}/checklist/${itemId}`, "PATCH", changes),
    deleteChecklistItem: (cardId: string, itemId: string) =>
      send<BoardData>(`${base}/cards/${cardId}/checklist/${itemId}`, "DELETE"),
    addLabel: (name: string, color: LabelColor) =>
      send<BoardData>(`${base}/labels`, "POST", { name, color }),
    updateLabel: (labelId: string, changes: { name?: string; color?: LabelColor }) =>
      send<BoardData>(`${base}/labels/${labelId}`, "PATCH", changes),
    deleteLabel: (labelId: string) => send<BoardData>(`${base}/labels/${labelId}`, "DELETE"),
    chat: (message: string, history: ChatMessage[]) =>
      send<ChatResponse>(`${base}/chat`, "POST", { message, history }),
  };
};
