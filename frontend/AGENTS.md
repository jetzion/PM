# Frontend

Next.js frontend for a single persistent Kanban board. Login state lives in `localStorage`; board state is loaded from and saved to the FastAPI backend.

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
- `src/components/AppShell.tsx` — client-only demo login. Accepts `user` / `password`, stores `pm-demo-authenticated` in `localStorage`, and renders `KanbanBoard` after login.
- `src/lib/api.ts` — same-origin API client for `/api/board`, `/api/columns`, `/api/cards`, and `/api/chat`.
- `src/app/globals.css` — brand tokens; this file is the source of truth for later UI:
  - `--accent-yellow` `#ecad0a`
  - `--primary-blue` `#209dd7`
  - `--secondary-purple` `#753991`
  - `--navy-dark` `#032147`
  - `--gray-text` `#888888`

## Board data

`src/lib/kanban.ts` is the model and the move helper.

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

`initialData` remains as the demo seed reference and test fixture. The running app loads persisted board data from `GET /api/board`.

`moveCard(columns, activeId, overId)` reorders within a column or moves across columns. `overId` can be a card id or a column id.

## Components

- `AppShell` — owns the client-only login/logout flow.
- `KanbanBoard` — loads the board from the API after login and saves all board actions through the API. Handles drag, add/rename/delete column, add/edit/delete card, optional logout, and the chat sidebar. The sidebar is open by default.
- `ChatSidebar` — message list, input, and send button. Stores history in `sessionStorage` under `pm-chat-history` (survives refresh, ends with the tab session). Sends prior messages as `history` and the new text as `message` to `POST /api/chat`. A returned `board` replaces the visible board immediately. Shows "Thinking..." while a request is in flight and an error if the call fails.
- `KanbanColumn` — droppable column, editable title input that commits on blur/Enter, delete column button, card list, `NewCardForm`. `data-testid="column-{id}"`.
- `KanbanCard` — sortable card. Shows title and details, supports inline edit, and has remove. `data-testid="card-{id}"`.
- `KanbanCardPreview` — drag overlay clone (no remove button).
- `NewCardForm` — collapsed "Add a card" control; title required, details optional.

## Tests

- `src/components/AppShell.test.tsx` — wrong credentials, successful login persistence, logout.
- `src/lib/kanban.test.ts` — `moveCard` reorder, cross-column move, drop on empty column.
- `src/components/KanbanBoard.test.tsx` — board loads from mocked API data; add/edit card render returned API boards.
- `src/components/ChatSidebar.test.tsx` — mocked chat replies, board replacement, unchanged board, and `sessionStorage` history.
- `tests/kanban.spec.ts` — Docker-backed login/logout and persistence checks for add/edit/move card plus add/rename/delete column. Chat e2e mocks `POST /api/chat`.

E2E tests reset the backend board with `PUT /api/board` before each test.
