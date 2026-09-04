#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/deploy"

if [[ ! -f .env ]]; then
  cp .env.stack.example .env
  echo "Created deploy/.env from .env.stack.example — edit secrets in ../.env before production."
fi

docker compose -f docker-compose.stack.yml up -d --build "$@"
