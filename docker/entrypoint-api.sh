#!/bin/sh
set -e

mkdir -p storage/invoices uploads

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  case "${DATABASE_URL:-}" in
    mongodb://*|mongodb+srv://*)
      echo "Syncing MongoDB schema (prisma db push)..."
      # Mongo has no SQL migration history; push is idempotent once Atlas is reachable.
      if ! ./node_modules/.bin/prisma db push --skip-generate; then
        echo "WARN: prisma db push failed — continuing startup (check Atlas network access / TLS)."
      fi
      ;;
    *)
      echo "Running database migrations..."
      ./node_modules/.bin/prisma migrate deploy
      ;;
  esac
fi

exec "$@"
