# Backend

FastAPI app served from Docker. Uvicorn listens on port 8000.

## Layout

- `main.py` — app entry, request models, auth dependencies, API routes, and static Next.js serving. Board-scoped routes live on `board_router` (prefix `/api/boards/{board_id}`). `shared_board` admits the owner and members (404 for anyone else); `owned_board` is owner-only (403 for members) and guards rename, delete, and adding members.
- `auth.py` — scrypt password hashing and session token generation (stdlib only).
- `database.py` — SQLite schema, legacy migration, seed data, board validation, and persistence helpers. See `docs/DATABASE.md`.
- `ai.py` — OpenRouter client. Uses `OPENROUTER_API_KEY` and model `openai/gpt-oss-120b`. Failures become `AIRequestError` (HTTP 502) with a user-facing `detail`: 401 bad key, 402 out of credits, 429 rate limited, read timeout (90 s without data), otherwise "OpenRouter request failed". The chat sidebar shows that detail. Note the timeout is per read, not total: a slowly streaming reply (seen on free-tier accounts) can take many minutes.
- `pyproject.toml` — Python deps, installed with `uv` in the image. Test deps (`pytest`, `pytest-cov`, `httpx`) live in the dev group.

## API

All routes except health, register, and login require the `pm_session` cookie (401 otherwise).

Auth and account:
- `POST /api/auth/register` `{username, password}` — 201, creates the user with a demo board and signs in. Username 3-32 of `[A-Za-z0-9_.-]`, unique ignoring case (409). Password at least 8 characters.
- `POST /api/auth/login` `{username, password}` — sets the cookie; 401 on bad credentials.
- `POST /api/auth/logout` — 204, deletes the session.
- `GET /api/auth/me` — `{id, username}`.
- `PUT /api/auth/password` `{currentPassword, newPassword}` — 204; signs out the user's other sessions.
- `POST /api/auth/logout-all` — 204, deletes every session for the user.
- `POST /api/auth/delete-account` `{password}` — 204, deletes the user and (by cascade) all their sessions, boards, columns, cards, and labels; 400 on a wrong password.

Boards (summaries are `{id, name, createdAt, columnCount, cardCount, role: owner|member, owner}`; own boards first):
- `GET /api/boards`, `POST /api/boards` `{name}` (201)
- `PATCH /api/boards/{id}` `{name}`, `DELETE /api/boards/{id}` (204)
- `GET /api/boards/{id}`, `PUT /api/boards/{id}` — full `BoardData`
- `POST /api/boards/{id}/columns`, `PATCH|DELETE /api/boards/{id}/columns/{columnId}` (deleting the done column clears `doneColumnId`)
- `PUT /api/boards/{id}/done-column` `{columnId | null}`
- `POST /api/boards/{id}/cards` `{columnId, title, details?, priority?, dueDate?, labelIds?}`, `PATCH /api/boards/{id}/cards/{cardId}` (any of `title`, `details`, `priority`, `dueDate`, `labelIds`; `dueDate: null` clears it; `labelIds` replaces the set), `DELETE /api/boards/{id}/cards/{cardId}`, `POST /api/boards/{id}/cards/{cardId}/move` `{columnId, position}`
- `GET|POST /api/boards/{id}/cards/{cardId}/comments` `{body}`, `DELETE /api/boards/{id}/cards/{cardId}/comments/{commentId}` — return the card's comments `[{id, body, author, createdAt}]`
- `GET /api/boards/{id}/members` (owner first), `POST /api/boards/{id}/members` `{username}` (owner only; 404 unknown user, 409 already has access), `DELETE /api/boards/{id}/members/{userId}` (owner removes anyone; a member may remove only themselves)
- `POST /api/boards/{id}/duplicate` `{name}` — 201 summary of the copy (no comments)
- `POST /api/boards/{id}/cards/{cardId}/checklist` `{text}`, `PATCH /api/boards/{id}/cards/{cardId}/checklist/{itemId}` `{text?, done?}`, `DELETE /api/boards/{id}/cards/{cardId}/checklist/{itemId}`
- `POST /api/boards/{id}/labels` `{name, color}`, `PATCH /api/boards/{id}/labels/{labelId}` `{name?, color?}`, `DELETE /api/boards/{id}/labels/{labelId}`
- `POST /api/boards/{id}/chat` `{message, history}` — `{message, board | null}`

Overview: `GET /api/overview?today=YYYY-MM-DD` — `{today, boards: [{id, name, cardCount, overdueCount, doneCount, priorities: {low, medium, high}}], dueSoon: [{boardId, boardName, cardId, title, dueDate, priority, columnTitle}]}`. `today` defaults to the server date; `dueSoon` is past-due or within 7 days, sorted by date, max 20. Cards in a board's done column are excluded from overdue and due soon.

Other: `GET /api/health`, `POST /api/ai/ping` (signed in).

Every column/card/checklist/label mutation returns the full `BoardData`.

## Run

Use `scripts/start.sh` or `scripts/start.bat` from the repo root. Do not run this app on the host.

The container receives root `.env` and mounts Docker volume `pm-data` at `/data`. SQLite uses `/data/app.db`.

## Tests

Run from the repo root with Docker (add `--cov=. --cov-report=term-missing` for coverage):

```bash
docker run --rm -v "$PWD/backend":/app -w /app ghcr.io/astral-sh/uv:python3.13-bookworm uv run pytest
```

Fixtures in `tests/conftest.py`:
- `db_path` (autouse) — points `PM_DB_PATH` at a temp file.
- `make_client(username=None)` — opens a `TestClient` (lifespan runs), registering and signing in as `username` when given. Each client has its own cookie jar, so two clients are two users.
- `client` — signed in as a fresh user `alice`; `board_url` — that user's starter board URL.
- `mock_openrouter(content)` — fakes `urlopen` and records the request.

Test files: `test_sharing.py` (members and permissions), `test_comments.py` (comments and pruning), `test_duplicate.py`, `test_checklist.py` (card checklists), `test_overview.py` (dashboard aggregates), `test_done_column.py` (completed cards), `test_cards.py` (priority and due date), `test_labels.py` (labels and card tagging), `test_auth.py` (register/login/logout/password), `test_boards.py` (board CRUD, per-board id independence, cross-user isolation), `test_api.py` (startup, column/card routes, ordering), `test_chat.py`, `test_ai.py`, `test_migration.py` (legacy schema upgrade).
