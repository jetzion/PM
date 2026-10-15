# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- `AGENTS.md` (root) holds the business requirements, MVP limitations, color scheme, and coding standards. Its standards are binding: keep it simple, no over-engineering or defensive programming, no emojis, prove root cause before fixing.
- `docs/PLAN.md` is the part-by-part plan. Its "Locked decisions" and "Implementation decisions from completed parts" sections are settled; do not reopen them unless the user asks. Check off items and update it as work completes.
- `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`, and `docs/DATABASE.md` describe each area. Keep them current when changing that area.

## Commands

The app only runs in Docker. Do not run the backend on the host.

```bash
./scripts/start.sh   # build image pm-app, replace the container, serve http://localhost:8000
./scripts/stop.sh    # remove the container (the pm-data volume is kept)
```

`start.sh` requires a root `.env` containing `OPENROUTER_API_KEY`. Any backend or frontend change needs a re-run of `start.sh` to show up at port 8000, since the image bakes in both.

Backend tests (from the repo root, run inside the uv image):

```bash
docker run --rm -v "$PWD/backend":/app -w /app ghcr.io/astral-sh/uv:python3.13-bookworm uv run pytest
# single file / single test
docker run --rm -v "$PWD/backend":/app -w /app ghcr.io/astral-sh/uv:python3.13-bookworm uv run pytest tests/test_api.py::test_column_lifecycle
```

Frontend (from `frontend/`):

```bash
npm run lint
npm run test:unit                                  # Vitest, src/**/*.test.{ts,tsx}
npx vitest run src/lib/kanban.test.ts              # single file
npx vitest run -t "name of test"                   # single test by name
npm run test:e2e                                   # Playwright, tests/
npx playwright test -g "name of test"              # single e2e test
npm run build                                      # static export to out/
```

E2E notes:
- Playwright targets the Docker app at `127.0.0.1:8000`, not the Next dev server. It runs `scripts/start.sh` only if nothing is already answering `/api/health`, so rebuild with `start.sh` first when the code has changed.
- Every e2e test registers its own unique user, so tests are isolated; they do add throwaway users to the `pm-data` volume.
- `npm run dev` (port 3000) has no backend behind it; `/api` calls fail there. Use it for layout work only.

## Architecture

One container: a multi-stage `Dockerfile` builds the Next.js static export (`output: "export"`) and copies `out/` to `/app/static`; FastAPI serves JSON under `/api` and mounts the static site at `/` last, so API routes must be declared before the mount in `backend/main.py`.

### Board contract

The whole app passes around a single shape, defined in `frontend/src/lib/kanban.ts` and mirrored by the Pydantic models in `backend/main.py`:

```ts
type BoardData = {
  columns: { id: string; title: string; cardIds: string[] }[];
  cards: Record<string, {
    id: string; title: string; details: string;
    priority: "low" | "medium" | "high"; dueDate: string | null; // YYYY-MM-DD
    labelIds: string[];
    checklist: { id: string; text: string; done: boolean }[];
    commentCount: number; // read-only; comments live at /cards/{id}/comments
  }>;
  labels: { id: string; name: string; color: "yellow" | "blue" | "purple" | "navy" | "gray" }[];
  doneColumnId: string | null; // cards in this column are completed, never overdue
};
```

Board data lives at `/api/boards/{boardId}/...`. Every column/card endpoint returns the full `BoardData`, and the frontend replaces its state with that response rather than patching locally (`applyBoardChange` in `KanbanBoard.tsx`). Drag and drop computes the new order locally with `moveCard`, then sends `POST /api/boards/{id}/cards/{cardId}/move` with `{ columnId, position }`. The wire format is camelCase (`cardIds`, `columnId`). Column, card, and label ids are unique per board only.

### Backend

- `main.py` — routes and request models. `current_user` reads the `pm_session` cookie (401 if missing/invalid). Board-scoped routes sit on `board_router` and depend on `shared_board` (owner or member; 404 for anyone else) or, for rename/delete/add member, `owned_board` (403 for members). Use `shared_board` for new content routes.
- `auth.py` — scrypt password hashing and session tokens (stdlib only).
- `database.py` — SQLite schema (`users`, `sessions`, `boards`, `columns`, `cards`), the legacy single-board migration, seed data, and the read/write mapping between normalized rows and `BoardData`. Ordering is a zero-based `position` column that must be kept contiguous after deletes and moves. `replace_board` validates then rewrites all of a board's columns and cards; callers wrap it in `with conn:` so an invalid board rolls back.
- `ai.py` — OpenRouter call via `urllib` (no SDK), model `openai/gpt-oss-120b`, with a strict JSON schema response format.

The DB path is `/data/app.db` (Docker volume `pm-data`), overridable with `PM_DB_PATH`. Tests set `PM_DB_PATH` to a temp file and mock `ai.urllib.request.urlopen`; schema creation and seeding happen in the FastAPI lifespan. Use the `make_client` / `client` / `board_url` fixtures in `tests/conftest.py` for signed-in clients.

Comments are the exception to the full-board pattern: they are not in `BoardData`, their routes return the card's comment list, and they are pruned (not cascaded) when cards disappear because `replace_board` re-inserts cards.

Adding a card field means touching: the `cards` schema plus a migration step in `init_database`, `get_board` / `validate_board` / `replace_board`, the Pydantic models, the AI `CHAT_RESPONSE_FORMAT`, the `Card` type, and both seed copies below.

The demo seed board (given to every new user) exists twice and must stay in sync: `DEMO_BOARD` in `backend/database.py` and `initialData` in `frontend/src/lib/kanban.ts` (now only a test fixture and reference).

### AI chat flow

`POST /api/boards/{id}/chat` takes `{ message, history }`. The backend loads that board, puts it in the system prompt, and asks the model for `{ message, board | null }`. A non-null board is a full replacement saved through `replace_board`; if it fails validation it is discarded and the reply notes the update was not applied. The frontend `ChatSidebar` keeps per-board history in `sessionStorage` (`pm-chat-history:{boardId}`), never in the database, and swaps in any returned board.

### Frontend

`AppShell` checks `GET /api/auth/me` and shows sign-in / registration or the `Workspace`. `Workspace` owns the board list sidebar and account panel and renders `KanbanBoard` for the active board, which owns board state, drag and drop (`@dnd-kit`), and the AI chat. The chat is portaled into a slot in the lower part of the workspace sidebar (`chatSlot` prop). All HTTP goes through `src/lib/api.ts` using same-origin relative paths. Brand colors are CSS variables in `src/app/globals.css`; use those tokens for new UI.
