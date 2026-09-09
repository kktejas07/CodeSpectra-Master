#!/bin/sh
# Pre-push fast gate — run from the repo root BEFORE every `git push`:
#   sh scripts/pre-push-gate.sh
# Mirrors the required CI jobs that finish in ~2 minutes locally:
#   [1] typecheck (tsc)  [2] unittest (vitest)  [3] backend-unit (offline pytest)
# Slow gates (yarn build, docker image build, dep/secret audits) run in
# GitHub Actions after the push — check them there, fix-forward on red.
# Exits nonzero on the first failure. Do NOT push on red.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> [1/3] tsc --noEmit"
(cd "$ROOT/frontend" && npx tsc --noEmit)
echo "    tsc clean"

echo "==> [2/3] vitest run"
(cd "$ROOT/frontend" && npx vitest run 2>&1 | tail -3)

echo "==> [3/3] backend unit tests (offline subset — same list as CI)"
(cd "$ROOT" && python3 -m pytest \
  backend/tests/test_ai_routes.py \
  backend/tests/test_core.py \
  backend/tests/test_course_factory.py \
  backend/tests/test_domain_plugins.py \
  backend/tests/test_item_bank_and_generic_plugins.py \
  backend/tests/test_text_to_cad_generator.py \
  backend/tests/test_webhooks_and_compliance.py \
  -q -p no:cacheprovider 2>/dev/null | tail -2)

echo ""
echo "GATE GREEN — safe to push."
