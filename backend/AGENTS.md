# Backend

FastAPI app served from Docker. Uvicorn listens on port 8000.

## Layout

- `main.py` — app entry. `GET /api/health` returns `{"status":"ok"}`. Everything else is the Next.js static export copied to `static/` at image build time.
- `pyproject.toml` — Python deps, installed with `uv` in the image.

## Run

Use `scripts/start.sh` or `scripts/start.bat` from the repo root. Do not run this app on the host.

The container receives root `.env` and mounts Docker volume `pm-data` at `/data` for SQLite later.
