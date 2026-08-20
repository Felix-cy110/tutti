#!/bin/sh
set -eu

: "${TUTTI_APP_NODE:?TUTTI_APP_NODE is required}"
: "${TUTTI_APP_PACKAGE_DIR:?TUTTI_APP_PACKAGE_DIR is required}"
: "${TUTTI_APP_HOST:?TUTTI_APP_HOST is required}"
: "${TUTTI_APP_PORT:?TUTTI_APP_PORT is required}"

deck_vite="/Users/chenyang/project/tutti-deck/node_modules/vite/bin/vite.js"

if [ ! -f "$deck_vite" ]; then
  echo "Tutti Deck POC requires /Users/chenyang/project/tutti-deck with dependencies installed" >&2
  exit 1
fi

cd "$TUTTI_APP_PACKAGE_DIR"

exec "$TUTTI_APP_NODE" "$deck_vite" \
  --config "$TUTTI_APP_PACKAGE_DIR/vite.config.mjs" \
  --configLoader runner \
  --host "$TUTTI_APP_HOST" \
  --port "$TUTTI_APP_PORT" \
  --strictPort
