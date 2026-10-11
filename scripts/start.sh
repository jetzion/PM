#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env in project root"
  exit 1
fi

docker build -t pm-app .
if docker container inspect pm-app >/dev/null 2>&1; then
  docker rm -f pm-app >/dev/null
fi
docker run -d --name pm-app -p 8000:8000 --env-file .env -v pm-data:/data pm-app
echo "App running at http://localhost:8000"
