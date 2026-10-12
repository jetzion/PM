# Backend

FastAPI app served from Docker. Uvicorn listens on port 8000.

## Layout

- `main.py` — app entry, request models, API routes, and static Next.js serving.
- `database.py` — SQLite schema, seed data, board validation, and persistence helpers.
- `ai.py` — OpenRouter client. Uses `OPENROUTER_API_KEY` and model `openai/gpt-oss-120b`.
- `tests/test_api.py` — API tests with a temporary SQLite file.
- `tests/test_ai.py` — mocked OpenRouter ping tests.
- `tests/test_chat.py` — mocked chat tests for reply-only, board replacement, invalid boards, and prompt contents.
- `pyproject.toml` — Python deps, installed with `uv` in the image. Test deps live in the dev dependency group.

## API

- `GET /api/health`
- `POST /api/ai/ping`
- `POST /api/chat`
- `GET /api/board`
- `PUT /api/board`
- `POST /api/columns`
- `PATCH /api/columns/{id}`
- `DELETE /api/columns/{id}`
- `POST /api/cards`
- `PATCH /api/cards/{id}`
- `DELETE /api/cards/{id}`
- `POST /api/cards/{id}/move`

## Run

Use `scripts/start.sh` or `scripts/start.bat` from the repo root. Do not run this app on the host.

The container receives root `.env` and mounts Docker volume `pm-data` at `/data`. SQLite uses `/data/app.db`.

## Tests

Run backend tests from the repo root with Docker:

```bash
docker run --rm -v "$PWD/backend":/app -w /app ghcr.io/astral-sh/uv:python3.13-bookworm uv run pytest
```
