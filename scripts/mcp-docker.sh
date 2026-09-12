#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec docker compose -f docker-compose.yml -f compose.mcp.yml run --rm -T --no-deps mcp
