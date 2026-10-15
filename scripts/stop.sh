#!/bin/sh
docker rm -f pm-app >/dev/null 2>&1 || true
echo "App stopped"
