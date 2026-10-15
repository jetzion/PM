#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env in project root"
  exit 1
fi

docker build -t pm-app .
docker rm -f pm-app >/dev/null 2>&1 || true
docker run -d --name pm-app -p 8000:8000 --env-file .env -v pm-data:/data pm-app

# Return only once the app answers, so callers (like Playwright) never see a half-started container.
tries=0
until curl -sf http://localhost:8000/api/health >/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "App did not become healthy; see: docker logs pm-app"
    exit 1
  fi
  sleep 0.5
done
echo "App running at http://localhost:8000"
