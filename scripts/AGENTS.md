# Scripts

Start and stop the Docker app from the repo root.

| Platform | Start | Stop |
| --- | --- | --- |
| Mac / Linux | `./scripts/start.sh` | `./scripts/stop.sh` |
| Windows | `scripts\start.bat` | `scripts\stop.bat` |

Start builds image `pm-app`, replaces any existing `pm-app` container, publishes `8000:8000`, passes `.env`, and mounts volume `pm-data` at `/data`. It returns only after `GET /api/health` answers (about 30-60 seconds max, then it fails). Playwright relies on this: if health is not up yet it runs `start.sh` itself, which would replace a container that was still booting mid-test.
