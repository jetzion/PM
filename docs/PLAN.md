# Project plan

Work through parts in order. Check off items as they are completed. Do not start the next part until the current part's success criteria are met. Part 5 requires explicit user sign-off before Part 6.

## Locked decisions

These were agreed before implementation. Do not reopen them unless the user asks.

- Port: `8000` (`http://localhost:8000`)
- One Docker container. FastAPI serves the static Next.js export at `/` and JSON APIs under `/api`.
- SQLite file on a Docker volume so data survives container restarts. Create the DB if it is missing.
- Schema is normalized tables, not a JSON blob. Multiple users in the schema; MVP seeds one user (`user` / `password`) with one board.
- New users start with the current frontend demo cards and columns.
- Login is client-only (hardcoded `user` / `password`). The backend Kanban APIs operate on that seeded user.
- Users and the AI can create, edit, move, and delete cards.
- Users and the AI can add, rename, and delete columns.
- AI chat history lives in `sessionStorage` only (survives refresh, dies when the tab session ends). Not stored in the database.
- When the AI changes the board, it returns a full replacement board. The backend saves that replacement and the UI refreshes from it.
- OpenRouter model: `openai/gpt-oss-120b`. Key from root `.env` as `OPENROUTER_API_KEY`.
- Python deps via `uv`. Frontend is the existing Next.js app in `frontend/`.
- Color scheme from root `AGENTS.md`. New UI uses those tokens. No emojis.

## Current frontend gaps

The demo already supports rename column, add card, delete card, and drag-and-drop. It does not yet support:

- Edit card title or details
- Add column
- Delete column
- Login / logout
- Persistence
- AI chat

Add those when the part that needs them is in progress (board UI in Part 7, auth in Part 4, chat in Part 10).

---

## Part 1: Plan

**Goal:** A detailed, approved plan and a description of the existing frontend.

### Checklist

- [x] Review root `AGENTS.md` and this plan
- [x] Confirm product and technical decisions with the user
- [x] Enrich this document with per-part checklists, tests, and success criteria
- [x] Create `frontend/AGENTS.md` describing the existing frontend
- [x] Update root `AGENTS.md` so column/card scope matches the locked decisions
- [x] User reviews and approves this plan

### Tests

None. This part is documentation only.

### Success criteria

- This file is specific enough to execute without re-asking locked questions.
- `frontend/AGENTS.md` exists and matches the current frontend.
- User has approved the plan in chat.

---

## Part 2: Scaffolding

**Goal:** One local Docker app that serves hello-world HTML and a working API.

### Checklist

- [x] Add `backend/` FastAPI app using `uv` (`pyproject.toml`)
- [x] Serve a small static HTML page at `/` that says hello and calls the API
- [x] Add `GET /api/health` returning JSON (for example `{"status":"ok"}`)
- [x] Add a Dockerfile that installs Python via `uv` and runs uvicorn on port 8000
- [x] Mount a Docker volume for future SQLite data (even if unused in this part)
- [x] Pass root `.env` into the container (needed later for OpenRouter)
- [x] Add start/stop scripts:
  - `scripts/start.sh` and `scripts/stop.sh` (Mac / Linux)
  - `scripts/start.bat` and `scripts/stop.bat` (Windows)
- [x] Scripts build/run the container, publish `8000:8000`, and print the URL
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md` to describe what is there
- [x] Keep the root README minimal: how to start, stop, and open the app

### Tests

- [x] After `scripts/start.sh` (or `.bat`), `curl http://localhost:8000` returns the HTML page
- [x] `curl http://localhost:8000/api/health` returns JSON with a success status
- [x] The HTML page's fetch of `/api/health` succeeds (verify in the browser)
- [x] `scripts/stop.sh` (or `.bat`) stops the container

### Success criteria

- A teammate can start the app on Mac, Windows, or Linux with the scripts and see hello world plus a successful API call at `http://localhost:8000`.
- No Next.js integration yet.

---

## Part 3: Add in frontend

**Goal:** The existing demo Kanban is statically built and served at `/`.

### Checklist

- [x] Configure Next.js static export (`output: "export"`)
- [x] Update the Docker build to `npm ci` + `npm run build` in `frontend/`, then copy `out/` into the image
- [x] FastAPI serves that export at `/` (replace the hello-world HTML)
- [x] Keep `/api/health` working
- [x] Confirm brand CSS variables already in `frontend/src/app/globals.css` are the source of truth for later UI
- [x] Existing frontend unit and e2e tests still pass against the Next app
- [x] Add a simple check that the container serves the board (curl and browser)

### Tests

- [x] `frontend`: `npm run test:unit` passes
- [x] `frontend`: `npm run test:e2e` passes
- [x] Running container: `GET /` returns the Kanban HTML (not hello world)
- [x] Browser: board title, five columns, and demo cards are visible
- [x] Browser: `/api/health` still works

### Success criteria

- `http://localhost:8000` shows the demo Kanban board from `frontend/`.
- Board is still in-memory only (no login, no API persistence).

---

## Part 4: Fake user sign in

**Goal:** `/` shows a login screen first. After dummy credentials, the Kanban is visible. Logout returns to login.

### Checklist

- [x] Login form asking for username and password
- [x] Accept only `user` / `password`
- [x] Show a clear error on bad credentials
- [x] Remember login in `localStorage` so refresh stays signed in
- [x] Logout control on the board that clears login and returns to the form
- [x] Style with the existing color tokens (purple for submit)
- [x] Client-only: no auth API, no sessions on the server

### Tests

- [x] Unit: empty or wrong credentials stay on login and show an error
- [x] Unit: correct credentials render the board
- [x] Unit: logout returns to login
- [x] e2e: visit `/` sees login, not the board
- [x] e2e: log in as `user` / `password` and see the board
- [x] e2e: refresh stays logged in
- [x] e2e: logout, then `/` shows login again
- [x] e2e: board routes/actions are not usable while logged out

### Success criteria

- A user hitting `/` must log in before seeing the Kanban, and can log out.
- Backend is still unaware of auth.

---

## Part 5: Database modeling

**Goal:** Propose and document a normalized SQLite schema. Stop for user sign-off.

### Checklist

- [ ] Write `docs/DATABASE.md` with tables, columns, keys, and seed data
- [ ] Intended tables (draft; refine in the doc, then get sign-off):
  - `users`: `id`, `username` (unique), `password`
  - `columns`: `id`, `user_id`, `title`, `position`
  - `cards`: `id`, `column_id`, `title`, `details`, `position`
- [ ] No `boards` table: one board per user is `columns` + `cards` for that `user_id`
- [ ] Seed: user `user` / `password`, plus the current demo columns and cards
- [ ] Document create-if-missing, volume path (for example `/data/app.db`), and that chat is not stored
- [ ] User signs off on `docs/DATABASE.md` before any migration or API work

### Tests

None until the schema is approved.

### Success criteria

- `docs/DATABASE.md` is written.
- User has explicitly approved the schema.
- No database code lands before that approval.

---

## Part 6: Backend Kanban API

**Goal:** Authenticated-user-shaped APIs that read and change the seeded user's board. Database is created if missing.

### Checklist

- [ ] Implement the approved schema with SQLite (create tables on startup if absent)
- [ ] Seed the demo user and board only when the DB is empty
- [ ] Store the DB on the Docker volume
- [ ] Board APIs operate on the seeded `user` (no real auth)
- [ ] Routes (keep this set; do not add extras):
  - `GET /api/board` — columns + cards for the user
  - `PUT /api/board` — replace the user's board (used later by AI)
  - `POST /api/columns` — add a column
  - `PATCH /api/columns/{id}` — rename a column
  - `DELETE /api/columns/{id}` — delete a column and its cards
  - `POST /api/cards` — add a card to a column
  - `PATCH /api/cards/{id}` — edit title/details
  - `DELETE /api/cards/{id}` — delete a card
  - `POST /api/cards/{id}/move` — move/reorder a card
- [ ] Request/response JSON matches the frontend `BoardData` shape where a full board is returned
- [ ] Update `backend/AGENTS.md` with routes and how to run tests

### Tests

- [ ] Pytest: missing DB file is created and seeded
- [ ] Pytest: `GET /api/board` returns the demo board
- [ ] Pytest: add / rename / delete column
- [ ] Pytest: add / edit / delete / move card
- [ ] Pytest: `PUT /api/board` replaces the whole board
- [ ] Pytest: deleting a column deletes its cards
- [ ] Pytest: second startup does not duplicate seed data
- [ ] Manual: restart the container and `GET /api/board` still returns the last saved board

### Success criteria

- All board mutations work through the API and persist in SQLite across restarts.
- Frontend is still on local state.

---

## Part 7: Frontend + backend

**Goal:** The signed-in UI is a persistent Kanban backed by the API. Add the missing board actions.

### Checklist

- [ ] Load the board from `GET /api/board` after login
- [ ] Persist user actions through the Part 6 routes (not local-only state)
- [ ] Add UI: edit card title and details
- [ ] Add UI: add a column
- [ ] Add UI: delete a column
- [ ] Keep drag-and-drop, rename column, add card, delete card
- [ ] Refresh shows the last saved board
- [ ] Update `frontend/AGENTS.md` for API usage and new actions

### Tests

- [ ] Unit: board renders from mocked API data
- [ ] Unit: add / edit / delete card and column call the right endpoints
- [ ] e2e (against the running container): log in, add a card, refresh, card remains
- [ ] e2e: edit a card, refresh, edit remains
- [ ] e2e: move a card, refresh, position remains
- [ ] e2e: add a column, rename it, delete it; refresh matches
- [ ] Existing demo-only tests updated so they do not assume a hardcoded in-memory board

### Success criteria

- The app is a real persistent board for the dummy user.
- All user board actions listed in locked decisions work and survive refresh and container restart.

---

## Part 8: AI connectivity

**Goal:** Prove OpenRouter works from the backend. No board integration yet.

### Checklist

- [ ] Backend client for OpenRouter using `OPENROUTER_API_KEY` and model `openai/gpt-oss-120b`
- [ ] `POST /api/ai/ping` (or equivalent) sends a simple prompt such as `What is 2+2?` and returns the model text
- [ ] Clear error if the key is missing
- [ ] Do not expose the API key to the frontend

### Tests

- [ ] Pytest with a mocked OpenRouter response: endpoint returns the mocked answer
- [ ] One live call against the real key (from the running container): response mentions `4`
- [ ] Missing-key case returns a controlled error, not a stack trace

### Success criteria

- A live `2+2` call from the container succeeds.
- No Kanban JSON is sent to the model yet.

---

## Part 9: AI board updates

**Goal:** Chat completions send the board JSON, the user question, and conversation history. The model replies with structured output: a user-facing message and an optional full replacement board.

### Checklist

- [ ] `POST /api/chat` accepts `{ "message": string, "history": {role, content}[] }`
- [ ] Backend loads the current board and sends board JSON + history + new message to the model
- [ ] Structured output shape:
  - `message` (string, required): reply shown to the user
  - `board` (full `BoardData` or `null`): if present, replace and persist the user's board
- [ ] Validate the returned board before saving; on invalid board, keep the old board and still return a useful `message`
- [ ] System prompt: the AI may add/rename/delete columns and create/edit/move/delete cards; return a full board only when something changes
- [ ] History is whatever the client sends; backend does not store it

### Tests

- [ ] Pytest (mocked model): reply-only response does not change the DB
- [ ] Pytest (mocked model): response with a new board is saved and returned
- [ ] Pytest: invalid board payload is rejected and DB is unchanged
- [ ] Pytest: request includes current board JSON and history in the model call
- [ ] Optional live call: "Add a card called Live Test to Backlog" updates the board

### Success criteria

- Chat API can answer and, when the model chooses, replace the persisted board.
- No chat UI yet.

---

## Part 10: AI chat sidebar

**Goal:** A sidebar chat. The model can update the board; when it does, the UI refreshes.

### Checklist

- [ ] Sidebar chat on the signed-in board (open by default or with a clear toggle)
- [ ] Message list, text input, submit styled with the brand tokens
- [ ] Keep history in `sessionStorage`; restore it on refresh; clear it when the tab session ends
- [ ] Each send calls `POST /api/chat` with the message and stored history
- [ ] Show the model's `message` in the thread
- [ ] If the response includes `board`, replace the visible board immediately (no manual refresh)
- [ ] Loading and error states for in-flight or failed calls
- [ ] Update `frontend/AGENTS.md` for the chat widget

### Tests

- [ ] Unit: sending a message appends user + assistant text from a mocked API
- [ ] Unit: mocked response with `board` re-renders columns/cards
- [ ] Unit: mocked response without `board` leaves the board as-is
- [ ] Unit: history is written to `sessionStorage`
- [ ] e2e (mocked or live): open chat, send a message, see the reply
- [ ] e2e: when the reply includes a board update, the board DOM updates without reload
- [ ] Browser: restyle/layout check for the sidebar on desktop; chat usable without breaking the board

### Success criteria

- Signed-in users can chat with the AI in a sidebar.
- If the AI changes the board, the Kanban updates in place and the change is persisted.

---

## Suggested implementation notes

- Prefer the simplest working version. No extra auth, no extra entities, no chat persistence.
- Aim for about 80% test coverage when it is sensible, but do not add low-value tests just to hit that number. Focus on tests that protect real behavior; missing 80% is acceptable when the remaining coverage would be artificial.
- Frontend tests: Vitest + Testing Library in `frontend/src`, Playwright in `frontend/tests`. Point e2e at the container (`http://localhost:8000`) once the app is served from Docker.
- Backend tests: `pytest` via `uv`.
- When a part changes UI, verify in the browser, not only with tests.
- Identify root cause before fixing bugs.
