#!/bin/sh
set -eu

MAX_ATTEMPTS="${DB_INIT_MAX_ATTEMPTS:-20}"
SLEEP_SECONDS="${DB_INIT_SLEEP_SECONDS:-3}"

attempt=1
NODE_ENV_ARGS=""
if [ -f .env ]; then
  NODE_ENV_ARGS="--env-file=.env"
fi
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Running database init (attempt $attempt/$MAX_ATTEMPTS)..."
  if node $NODE_ENV_ARGS scripts/init-db.js; then
    echo "Database init completed."
    break
  fi

  echo "Database init failed; retrying in ${SLEEP_SECONDS}s..."
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

if [ "$attempt" -gt "$MAX_ATTEMPTS" ]; then
  echo "Database init failed after ${MAX_ATTEMPTS} attempts."
  exit 1
fi

exec "$@"
