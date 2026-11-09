#!/bin/sh
# Pre-push fast gate — run from the repo root BEFORE every `git push`:
#   sh scripts/pre-push-gate.sh
# Mirrors the required CI jobs that finish in ~2 minutes locally:
#   [1] typecheck (tsc)  [2] unittest (vitest)  [3] backend-unit (offline pytest)
#   [4] mobile typecheck  [5] mobile render tests (skipped if mobile/ is absent)
# Slow gates (yarn build, docker image build, dep/secret audits) run in
# GitHub Actions after the push — check them there, fix-forward on red.
# Exits nonzero on the first failure. Do NOT push on red.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> [1/3] tsc --noEmit"
(cd "$ROOT/frontend" && npx tsc --noEmit)
echo "    tsc clean"

echo "==> [2/3] vitest run"
# No pipes around the test commands: `npx vitest run | tail -3` exits with
# tail's status, so a failing suite still printed "GATE GREEN" and the breakage
# only surfaced on GitHub Actions. Capture to a log and check the real status.
# Local runs share the box with a Remotion render, and CPU starvation blows the
# 5s per-test default at random (different tests "fail" every run; the same
# files pass in isolation in seconds). Give slow local machines 20s — CI keeps
# the strict 5s default, so real hangs still go red there.
if ! (cd "$ROOT/frontend" && npx vitest run --testTimeout=20000 > /tmp/gate-vitest.log 2>&1); then
  tail -60 /tmp/gate-vitest.log
  echo "VITEST FAILED — see /tmp/gate-vitest.log"
  exit 1
fi
tail -3 /tmp/gate-vitest.log

echo "==> [3/3] backend unit tests (offline subset — same list as CI)"
if ! (cd "$ROOT" && python3 -m pytest \
  backend/tests/test_ai_routes.py \
  backend/tests/test_core.py \
  backend/tests/test_course_factory.py \
  backend/tests/test_domain_plugins.py \
  backend/tests/test_item_bank_and_generic_plugins.py \
  backend/tests/test_text_to_cad_generator.py \
  backend/tests/test_webhooks_and_compliance.py \
  -q -p no:cacheprovider > /tmp/gate-pytest.log 2>&1); then
  tail -40 /tmp/gate-pytest.log
  echo "BACKEND TESTS FAILED — see /tmp/gate-pytest.log"
  exit 1
fi
tail -2 /tmp/gate-pytest.log

# Mobile app: typecheck + render tests. Guarded so the gate still works on a
# checkout without mobile/ (or before `npm install` has run there).
if [ -f "$ROOT/mobile/package.json" ] && [ -d "$ROOT/mobile/node_modules" ]; then
  echo "==> [4/5] mobile tsc --noEmit"
  (cd "$ROOT/mobile" && npx tsc --noEmit)
  echo "    mobile tsc clean"

  echo "==> [5/5] mobile jest (screen render tests)"
  if ! (cd "$ROOT/mobile" && npx jest > /tmp/gate-mobile-jest.log 2>&1); then
    tail -40 /tmp/gate-mobile-jest.log
    echo "MOBILE JEST FAILED — see /tmp/gate-mobile-jest.log"
    exit 1
  fi
  tail -4 /tmp/gate-mobile-jest.log
fi

echo ""
echo "GATE GREEN — safe to push."
