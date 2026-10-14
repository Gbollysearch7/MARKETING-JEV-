#!/bin/sh
# Container entrypoint for Rankcall.
#  1. As root (only if started as root): make the data volume writable by the unprivileged "node" user,
#     then re-run this script as that user. Volumes on Fly.io and most VPS mounts are created root-owned.
#  2. If backups are configured and the database is missing (fresh volume, new machine, disaster recovery),
#     restore it from the Litestream replica.
#  3. Run the Next.js server under `litestream replicate -exec`, so every write is streamed to the bucket and
#     signals (deploys, restarts) reach the app through Litestream, which flushes before exiting.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
DB="$DATA_DIR/app.db"
CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"
export DATA_DIR

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown node:node "$DATA_DIR"
  # Files restored or written by an older root-run image would otherwise be unwritable.
  find "$DATA_DIR" -maxdepth 1 ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups --inh-caps=-all "$0" "$@"
fi

if [ -n "${LITESTREAM_BUCKET:-}" ]; then
  if [ ! -f "$DB" ]; then
    echo "start: $DB not found, restoring from the Litestream replica if one exists"
    litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$DB"
  fi
  echo "start: replicating $DB to s3 bucket $LITESTREAM_BUCKET"
  exec litestream replicate -config "$CONFIG" -exec "node server.js"
fi

echo "start: LITESTREAM_BUCKET is not set, running WITHOUT backups" >&2
exec node server.js
