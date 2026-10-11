#!/bin/sh
set -e
if docker container inspect pm-app >/dev/null 2>&1; then
  docker rm -f pm-app >/dev/null
fi
echo "App stopped"
