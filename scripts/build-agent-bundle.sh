#!/usr/bin/env bash
# Builds the self-contained swarm-agent tarball served by the backend's
# /api/v1/storage/agent/bundle.tgz endpoint. Produces a tgz whose top-level
# directory is `swarmui-shared-storage-agent/`, containing:
#   dist/            compiled JS (bin.js + handlers)
#   node_modules/    production deps resolved by pnpm (ws, storage-plan)
#   package.json
#
# Usage: scripts/build-agent-bundle.sh <output.tgz>
# Caller is expected to have already run `pnpm install` + `pnpm build` so
# that packages/swarm-agent/dist exists.

set -euo pipefail

OUT="${1:-apps/backend/assets/agent-bundle.tgz}"
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "build-agent-bundle: output=$OUT staging=$STAGING"

# `pnpm deploy --prod` collects the agent + resolved deps into a self-contained
# folder with its own node_modules. The staging folder name becomes the
# tarball's top-level directory.
cd "$WORKSPACE_ROOT"
pnpm --filter @swarmui-master/swarm-agent --prod deploy "$STAGING/swarmui-shared-storage-agent" >&2

# Trim source + tsconfig — the runtime only needs dist + node_modules + package.json.
rm -rf \
  "$STAGING/swarmui-shared-storage-agent/src" \
  "$STAGING/swarmui-shared-storage-agent/tsconfig.json" \
  2>/dev/null || true

# Ensure target dir exists.
mkdir -p "$(dirname "$OUT")"

tar -czf "$OUT" -C "$STAGING" swarmui-shared-storage-agent
echo "build-agent-bundle: wrote $OUT ($(stat -c%s "$OUT" 2>/dev/null || wc -c < "$OUT") bytes)"
