#!/bin/bash
# Runs once, when the mongo container starts with an empty data volume
# (docker-entrypoint-initdb.d). Loads the demo TOR snapshot so a fresh
# `docker compose up` shows real TORs without running a sync.
set -euo pipefail
ARCHIVE=/docker-entrypoint-initdb.d/tors.archive.gz
if [ ! -f "$ARCHIVE" ]; then
  echo "[seed] $ARCHIVE not found, skipping"
  exit 0
fi
mongorestore --quiet --gzip --archive="$ARCHIVE" \
  --nsInclude='*.tors' --nsFrom='$db$.tors' --nsTo='tor_website.tors'
echo "[seed] TOR snapshot restored into tor_website.tors"
