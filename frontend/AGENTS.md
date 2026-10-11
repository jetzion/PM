# Frontend

Pure Next.js demo of a single Kanban board. Login state lives in `localStorage`; board state lives in React memory and resets on refresh.

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

Dev server defaults to port 3000. Playwright starts `npm run dev` on `127.0.0.1:3000`.

## Layout

- `src/app/layout.tsx` — fonts (Space Grotesk, Manrope) and metadata. Title: Kanban Studio.
- `src/app/page.tsx` — renders `AppShell`.
- `src/components/AppShell.tsx` — client-only demo login. Accepts `user` / `password`, stores `pm-demo-authenticated` in `localStorage`, and renders `KanbanBoard` after login.
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

`initialData` is the demo seed: five columns (Backlog, Discovery, In Progress, Review, Done) and eight cards. New users should get this same seed once persistence exists.

`moveCard(columns, activeId, overId)` reorders within a column or moves across columns. `overId` can be a card id or a column id.

`createId(prefix)` builds ids like `card-...`.

## Components

- `AppShell` — owns the client-only login/logout flow.
- `KanbanBoard` — owns `board` state. Handles drag, rename column, add card, delete card, and optional logout. Header copy still says five fixed columns.
- `KanbanColumn` — droppable column, editable title input, card list, `NewCardForm`. `data-testid="column-{id}"`.
- `KanbanCard` — sortable card. Shows title and details. Remove button. No edit UI. `data-testid="card-{id}"`.
- `KanbanCardPreview` — drag overlay clone (no remove button).
- `NewCardForm` — collapsed "Add a card" control; title required, details optional.

There is no API client, no chat sidebar, no add/delete column UI, and no card edit UI.

## Tests

- `src/components/AppShell.test.tsx` — wrong credentials, successful login persistence, logout.
- `src/lib/kanban.test.ts` — `moveCard` reorder, cross-column move, drop on empty column.
- `src/components/KanbanBoard.test.tsx` — five columns, rename, add and remove a card.
- `tests/kanban.spec.ts` — login/logout flow, load board after login, add a card, drag `card-1` to Review.

When the board becomes API-backed, update these tests. They assume in-memory `initialData` and client-only login.
