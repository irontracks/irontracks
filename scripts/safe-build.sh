#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# IronTracks — Safe Build Script
# Runs all quality gates locally, bypassing macOS NFD issues.
# Usage:  ./scripts/safe-build.sh            (local Node)
#         ./scripts/safe-build.sh --docker   (Docker container)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

# ── Docker mode ──────────────────────────────────────────────
if [[ "${1:-}" == "--docker" ]]; then
  step "Building in Docker container (eliminates NFD/JDK issues)"
  docker build \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder-key}" \
    -t irontracks-build \
    -f Dockerfile \
    .
  ok "Docker build complete — all quality gates passed"
  exit 0
fi

# ── Local mode ───────────────────────────────────────────────
step "1/5 — Type Check (tsc --noEmit)"
npx tsc --noEmit && ok "TypeScript OK" || fail "TypeScript errors"

step "2/5 — Lint"
npm run lint && ok "Lint OK" || fail "Lint errors"

step "3/5 — Unit Tests (Vitest)"
npm run test:unit && ok "Unit tests OK" || fail "Unit test failures"

step "4/5 — Smoke Tests"
npm run test:smoke && ok "Smoke tests OK" || fail "Smoke test failures"

step "5/5 — Build"
npm run build && ok "Build OK" || fail "Build failed"

echo -e "\n${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  All quality gates passed! ✓${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
