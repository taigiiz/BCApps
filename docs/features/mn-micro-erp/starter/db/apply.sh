#!/usr/bin/env bash
# =============================================================================
# apply.sh - apply the canonical schema (db/schema/*.sql) to a PostgreSQL 16+ database.
#
# Usage:
#   db/apply.sh <database-url> [--seed] [--test]
#   DATABASE_URL=postgres://... db/apply.sh [--seed] [--test]
#
#   <database-url>  libpq URL or conninfo, e.g.
#                   postgresql://erp@localhost:5432/erp
#                   "host=/var/lib/postgresql port=55432 user=erp dbname=erp_schema_check"
#   --seed          also load the seed data: db/seed/legal_parameters.sql into tax.tax_parameter (first),
#                   then the MN localization package db/seed/mn_*.sql (global catalogs + the provisioning
#                   function platform.fn_provision_company_mn; see db/seed/README.md)
#   --test          run db/tests/catalog_checks.sql and db/tests/smoke.sql afterwards, and with --seed also
#                   db/tests/seed_checks.sql (the tests insert test tenants: use a scratch database only)
#
# The connecting role must be able to create roles and extensions for 000_extensions_roles.sql
# (bootstrap superuser locally / in CI). All other files switch to `SET ROLE app_owner`.
# Files are applied in lexical order, each in its own psql session with ON_ERROR_STOP=1;
# the script stops at the first error. The files are not idempotent: apply to an empty database.
# =============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
db_url="${DATABASE_URL:-}"
seed=0
run_tests=0

for arg in "$@"; do
    case "$arg" in
        --seed) seed=1 ;;
        --test) run_tests=1 ;;
        -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
        -*) echo "unknown option: $arg" >&2; exit 2 ;;
        *) db_url="$arg" ;;
    esac
done

if [[ -z "$db_url" ]]; then
    echo "usage: $0 <database-url> [--seed] [--test]   (or set DATABASE_URL)" >&2
    exit 2
fi

psql_run() {
    psql "$db_url" -X -q -v ON_ERROR_STOP=1 "$@"
}

server_version="$(psql_run -At -c 'SHOW server_version_num')"
if (( server_version < 160000 )); then
    echo "PostgreSQL 16 or newer is required (server_version_num=$server_version)" >&2
    exit 1
fi

shopt -s nullglob
files=("$here"/schema/*.sql)
if (( ${#files[@]} == 0 )); then
    echo "no schema files found in $here/schema" >&2
    exit 1
fi

for f in "${files[@]}"; do
    echo "==> $(basename "$f")"
    psql_run -f "$f"
done

if (( seed )); then
    echo "==> seed/legal_parameters.sql (into tax.tax_parameter)"
    # The seed uses the unqualified name tax_parameter; resolve it to the canonical table.
    PGOPTIONS="-c search_path=tax" psql_run -c 'SET ROLE app_owner' -f "$here/seed/legal_parameters.sql"
    # MN localization package (global catalogs, then the per-company provisioning functions), in lexical order
    for f in "$here"/seed/mn_*.sql; do
        echo "==> seed/$(basename "$f")"
        psql_run -f "$f"
    done
fi

if (( run_tests )); then
    echo "==> tests/catalog_checks.sql"
    psql_run -f "$here/tests/catalog_checks.sql"
    echo "==> tests/smoke.sql"
    psql_run -f "$here/tests/smoke.sql"
    if (( seed )); then
        echo "==> tests/seed_checks.sql"
        psql_run -f "$here/tests/seed_checks.sql"
    else
        echo "(tests/seed_checks.sql skipped: needs --seed)"
    fi
fi

echo "schema applied: ${#files[@]} files"
