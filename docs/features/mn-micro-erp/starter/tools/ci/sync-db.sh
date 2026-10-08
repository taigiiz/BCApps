#!/usr/bin/env bash
# =============================================================================
# tools/ci/sync-db.sh - copy the canonical database package into this repository's db/ folder.
#
# While the starter lives inside the specification package (BCApps docs/features/mn-micro-erp/starter),
# db/schema, db/seed, db/tests and db/apply.sh are COPIES of docs/features/mn-micro-erp/db (DECISIONS D-K1:
# db/schema/*.sql is the single source of truth for database names). Run this script after the canonical
# schema changes; the unit test DatabasePackageDriftTests fails when the copies differ.
#
# Usage: tools/ci/sync-db.sh [<path-to-canonical-db-folder>]   (default: ../db relative to the repo root)
# In the real repository (after "cp -r starter/. ."), db/ is the source itself and this script is not needed.
# =============================================================================
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src="${1:-$root/../db}"

if [[ ! -d "$src/schema" || ! -d "$src/seed" ]]; then
  echo "canonical db folder not found: $src (expected schema/ and seed/)" >&2
  exit 1
fi

for d in schema seed tests; do
  rm -rf "${root:?}/db/$d"
  cp -r "$src/$d" "$root/db/$d"
done
cp "$src/apply.sh" "$root/db/apply.sh"
echo "db/ synchronized from $src"
