#!/usr/bin/env bash
# End-to-end auth tests against the LOCAL Supabase stack (`supabase start`, disposable data).
# Never point this at a real project: it deletes and creates fixture users.
set -euo pipefail
cd "$(dirname "$0")/.."
ENVOUT=$(npx --yes supabase@2.121.0 status -o env)
get() { echo "$ENVOUT" | grep "^$1=" | cut -d= -f2- | tr -d '"'; }
export E2E_SUPABASE_URL="$(get API_URL)"
export E2E_SUPABASE_PUBLISHABLE_KEY="$(get ANON_KEY)"
export E2E_MAIL_URL="http://127.0.0.1:54324"
export E2E_SUPABASE_SERVICE_KEY="$(get SERVICE_ROLE_KEY)"
case "$E2E_SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing non-local URL"; exit 1;; esac
exec pnpm exec playwright test "$@"
