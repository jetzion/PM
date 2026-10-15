# Frontend

Next.js frontend for a multi-board project workspace. Sign-in is server-side (session cookie); boards are loaded from and saved to the FastAPI backend.

`next.config.ts` uses `output: "export"`. Docker builds `out/` and FastAPI serves it at `/`.

## Stack

- Next.js 16 (App Router) and React 19
- Tailwind CSS 4 with brand tokens in `src/app/globals.css`
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest + Testing Library for unit tests
- Playwright for e2e (`tests/`)

## Run and test

```bash
npm install
npm run dev
npm run test:unit
npm run test:e2e
```

Dev server defaults to port 3000. Playwright runs against the Docker app at `127.0.0.1:8000` and starts it with `../scripts/start.sh` when needed.

## Layout

- `src/app/layout.tsx` — fonts (Space Grotesk, Manrope) and metadata. Title: Kanban Studio.
- `src/app/page.tsx` — renders `AppShell`.
- `src/lib/api.ts` — same-origin API client: `authApi`, `boardsApi`, and `boardApi(boardId)`. Non-2xx responses throw `ApiError` carrying the backend `detail` string.
- `src/lib/ui.ts` — shared form class names and `errorMessage(err, fallback)`.
- `src/app/globals.css` — brand tokens; this file is the source of truth for later UI:
  - `--accent-yellow` `#ecad0a`
  - `--primary-blue` `#209dd7`
  - `--secondary-purple` `#753991`
  - `--navy-dark` `#032147`
  - `--gray-text` `#888888`
  - `--priority-low|medium|high` — one purple ramp (light to dark) for priority badges and charts; navy text on low/medium, white on high

## Board data

`src/lib/kanban.ts` is the model and the move helper.

```ts
type Priority = "low" | "medium" | "high";
type LabelColor = "yellow" | "blue" | "purple" | "navy" | "gray";
type Label = { id: string; name: string; color: LabelColor };
type Card = { id: string; title: string; details: string; priority: Priority; dueDate: string | null; labelIds: string[] };
type ChecklistItem = { id: string; text: string; done: boolean }; // Card.checklist: ChecklistItem[]
type CardFields = Omit<Card, "id" | "checklist">; // what addCard / updateCard send
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card>; labels: Label[]; doneColumnId: string | null };
```

`initialData` remains as the demo seed reference and test fixture. The running app loads persisted board data from `GET /api/boards/{id}`.

Filtering: `CardFilter`, `emptyFilter`, `isFilterActive`, `cardMatches(card, filter, today, isDone)`; done cards never match "Overdue only".

Date helpers: `toIsoDate(date)` (local `YYYY-MM-DD`), `dueStatus(dueDate, today, isDone)` -> `done | overdue | today | upcoming`, `formatDueDate` (`Jan 5, 2026`, no timezone parsing).

`moveCard(columns, activeId, overId)` reorders within a column or moves across columns. `overId` can be a card id or a column id.

## Components

- `AppShell` — calls `GET /api/auth/me` on load. Signed out: sign-in / create-account form (errors from the server are shown in a `role="alert"`). Signed in: renders `Workspace`. Logout calls the API and clears `sessionStorage`.
- `Workspace` — collapsible left sidebar (`aria-label="Workspace"`; "Collapse sidebar" / "Expand sidebar" buttons with `aria-expanded`, state in `localStorage` `pm-sidebar-collapsed`; collapsed it is a 64px rail on desktop and a thin top bar naming the current view on phones) with the board list (`nav` "Boards", active board has `aria-current="page"`, card counts), new board form, account panel toggle, and logout. Remembers the selected board in `localStorage` under `pm-active-board:{userId}`. Renders `KanbanBoard` keyed by board id, or an empty state when there are no boards.
- `Overview` — cross-board dashboard from `GET /api/overview` (sends the local date): stat tiles, per-board priority bar (`role="img"` with a summary label, segments `data-priority`, widths proportional) plus a legend with every count, and a "Due soon" `region` whose items open their board. Shown when the nav's "Overview" item is selected; `pm-active-board:{userId}` stores `overview` in that case.
- `AccountPanel` — change password, "Sign out everywhere", and password-confirmed "Delete account". The last two call `onSessionEnded` (from `AppShell`, which clears `sessionStorage` and returns to sign-in).
- `BoardHeader` — for owners: board name heading, counts, inline rename, "Duplicate board" (creates "{name} copy" and opens it), and two-step delete. For members (`isOwner` false): "Shared by {owner}" eyebrow, no rename, and two-step "Leave board" instead of delete (Delete board -> Confirm delete / Keep board).
- `KanbanBoard` — props `boardId`, `boardName`, `onRenameBoard`, `onDeleteBoard`, `onBoardChange`. Loads the board and saves all actions through `boardApi(boardId)`, replacing local state with each returned board. Handles drag, add/rename/delete column, add/edit/delete card, and the chat sidebar (open by default).
- `ChatSidebar` — per-board history in `sessionStorage` under `pm-chat-history:{boardId}`. It is owned by `KanbanBoard` (so AI boards replace its state) but rendered with `createPortal` into the `chatSlot` element that `Workspace` puts in the lower part of the sidebar, between the board list and Account / Log out. No slot (Overview, collapsed sidebar) means no chat. Closing it leaves an "Open chat" button in the slot. Compact one-row header, input and Send on one row; the message list (`data-testid="chat-messages"`) scrolls itself to the newest message on every change, including restored history. Sends prior messages as `history` to `POST /api/boards/{id}/chat`. A returned `board` replaces the visible board immediately.
- `FilterBar` — `section` "Filter cards": search, priority, label, overdue only, counts, clear. `KanbanBoard` passes only matching cards to columns (via `cardMatches`), and columns show "No matching cards" when filtered empty.
- `KanbanColumn` — droppable column, "Mark done" / "Done column" toggle (`aria-label="Done column: {title}"`, `aria-pressed`), cards get `isDone`, editable title input that commits on blur/Enter, delete column button, card list, `NewCardForm`. `data-testid="column-{id}"`.
- `KanbanCard` — sortable card with inline edit and remove. `data-testid="card-{id}"`.
- `KanbanCardPreview` — drag overlay clone.
- `CardMeta` — priority badge, due date chip (`data-due-status`), and label chips, used by cards and the drag preview.
- `MembersPanel` — `section` "Members" behind the board's "Members" toggle: list (owner first); the owner can share by username and remove members.
- `Comments` — a card's comment thread (`role="group"` "Comments for {title}"), loaded on open via `CommentHandlers` (`load`, `add`, `remove`). `KanbanBoard` patches the card's `commentCount` from each returned list. Cards show a "Comments (n)" toggle.
- `Checklist` — a card's items with check, remove, and add (`role="group"` "Checklist for {title}"); stops pointer/key events so it never starts a drag. `KanbanBoard` builds one `ChecklistHandlers` object (`add`, `toggle`, `remove`) passed through columns to cards. Cards show an "Add / Show / Hide checklist" toggle and `CardMeta` shows "n/m done".
- `LabelChip` — colored label pill (`data-label-color`); `labelColorClass` maps colors to brand tokens.
- `LabelManager` — `section` "Labels" toggled by the board header's "Labels (n)" button: rename (blur/Enter), recolor, delete, add.
- `CardFieldInputs` — priority select, due date input, and label checkboxes (named by label) shared by `NewCardForm` and the card edit form; labels are `Priority for {card}` / `Due date for {card}` (`for new card` in the add form).
- `NewCardForm` — collapsed "Add a card" control; title required, details optional.

## Tests

Unit tests stub `fetch`. `src/test/mockApi.ts` takes a route table keyed by `"METHOD /path"` (unknown routes answer 404); `src/test/jsonResponse.ts` builds responses; `src/test/boardProps.ts` holds default `KanbanBoard` props for board 1. Coverage (`npx vitest run --coverage`) is scoped to `src/` app code.

- `AppShell.test.tsx` — session restore, sign-in errors, sign-in/logout, registration.
- `Workspace.test.tsx` — list/switch/remember boards, create, rename, delete with confirm, empty state, live card counts, change password, logout.
- `KanbanBoard.test.tsx`, `ChatSidebar.test.tsx` — board actions and chat against board 1.
- `Overview.test.tsx` — totals, bar proportions and legend, due list, empty and error states.
- `CardMeta.test.tsx` — badges, due status with a faked `Date`, label chips.
- `MembersPanel.test.tsx` — owner share/errors/remove, read-only member view.
- `Comments.test.tsx` — load, empty, add, delete, error states.
- `Checklist.test.tsx` — render, toggle, remove, add.
- `LabelManager.test.tsx` — add, rename, recolor, delete, empty state.
- `src/lib/api.test.ts`, `src/lib/kanban.test.ts` — API errors, `moveCard`, date helpers, card filters.

Note: dnd-kit renders its own `role="status"` live region, so query the filter summary by text, not by role.
- `tests/kanban.spec.ts` (Playwright, Docker app) — each test registers a unique user through `page.request` (shares the page's cookies), so tests are isolated and never reset shared data. Covers UI registration/sign-in/logout, demo user, cross-user isolation, board create/switch/rename/delete, password change, card/column persistence, drag and drop, and mocked chat (`**/api/boards/*/chat`).
