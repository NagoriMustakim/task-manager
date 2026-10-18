#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL container (with a minimal Supabase
# stub) and runs supabase/tests/rls.test.sql. Requires Docker. This is plain Postgres,
# not a full Supabase stack: see docs/database-design.md "Verification status".
set -euo pipefail
cd "$(dirname "$0")/.."
IMG="${PG_IMAGE:-postgres:17}"
NAME="tracker-dbtest-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -v "$PWD/supabase:/sb:ro" "$IMG" >/dev/null
for _ in $(seq 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql -f /sb/tests/support/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "== applying $f"; psql -f "/sb/migrations/$(basename "$f")"; done
OUT=$(psql -f /sb/tests/rls.test.sql 2>&1) && RC=0 || RC=$?
echo "$OUT" | grep -E 'ok|FAIL|ALL RLS|ERROR' || true
[ "$RC" -eq 0 ] && echo "RESULT: PASS" || { echo "RESULT: FAIL"; exit 1; }
