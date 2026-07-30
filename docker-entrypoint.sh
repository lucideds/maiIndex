#!/bin/sh
set -e

# Ensure data directories exist and have proper write permissions for non-root node user
mkdir -p /data/cache /data/db
chown -R node:node /data/cache /data/db 2>/dev/null || chmod -R 777 /data/cache /data/db 2>/dev/null || true

# Drop privileges and execute command as node user
exec su-exec node "$@"
