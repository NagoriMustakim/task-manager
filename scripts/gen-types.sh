#!/usr/bin/env bash
# Regenerates src/types/database.ts from the migrations. Spins up a throwaway Postgres
# (same stub as test-db.sh), applies migrations, then runs `supabase gen types`.
# Against a real project instead: npx supabase gen types typescript --project-id <ref> --schema public
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="tracker-gentypes-$$"; PORT="${GEN_PORT:-54999}"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -p "$PORT:5432" -e POSTGRES_PASSWORD=pw -v "$PWD/supabase:/sb:ro" "${PG_IMAGE:-postgres:17}" >/dev/null
for _ in $(seq 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done; sleep 2
p() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f "$1"; }
p /sb/tests/support/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do p "/sb/migrations/$(basename "$f")"; done
mkdir -p src/types
npx --yes supabase@2.121.0 gen types typescript --db-url "postgresql://postgres:pw@127.0.0.1:$PORT/postgres?sslmode=disable" --schema public > src/types/database.ts
