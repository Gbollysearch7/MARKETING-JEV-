#!/usr/bin/env bash
# Copy the Rankcall database to data/backups/ (safe while the app is running).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATA_DIR:-data}/app.db"
[ -f "$DB" ] || { echo "No database at $DB yet."; exit 1; }
mkdir -p "$(dirname "$DB")/backups"
TO="$(dirname "$DB")/backups/app-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB" ".backup '$TO'"
echo "Backed up to $TO"
