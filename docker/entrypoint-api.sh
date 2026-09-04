#!/bin/sh
set -e

mkdir -p storage/invoices uploads

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
