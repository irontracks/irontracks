---
description: Pre-commit quality checklist — run before delivering any refactoring or feature work
---

# Pre-commit Quality Check

Run these steps sequentially to catch common issues before delivering work.

// turbo-all

## 1. Type Check (MUST pass with zero errors)
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && npx tsc --noEmit 2>&1 | tail -20
```
- If errors appear, fix them before proceeding
- Common issues: missing imports, hook ordering, type mismatches

## 2. Empty Catch Blocks (MUST be zero)
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && grep -rn "catch {" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | head -20
```
- Every `catch {}` must be replaced with `catch (e) { logWarn('context', 'message', e) }`
- Import `logWarn` from `@/lib/logger`

## 3. Large Files Check (warn if > 700 lines)
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && find src -name "*.ts" -o -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head -15
```
- Files > 1000 lines: decompose immediately (God Component risk)
- Files > 700 lines: flag for future refactoring
- Hooks > 300 lines: split into smaller hooks

## 4. Dead Code Detection (check for orphan files)
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && for f in $(find src -name "*.tsx" -not -path "*/page.tsx" -not -path "*/layout.tsx" -not -path "*/not-found.tsx" | head -30); do base=$(basename "$f" .tsx); count=$(grep -rl "$base" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "$f" | wc -l); if [ "$count" -eq 0 ]; then echo "⚠️  ORPHAN: $f"; fi; done
```
- Orphan files are never imported — consider deleting them
- Exceptions: Next.js pages (`page.tsx`, `layout.tsx`) are entry points

## 5. Missing Server Action Exports (spot-check)
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && grep -rn "from.*actions'" src/ --include="*.ts" --include="*.tsx" | grep "import {" | sed 's/.*import {//;s/}.*//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u | head -20
```
- Cross-reference: every imported action must be `export`ed from its source file

## 6. Hook Ordering Smoke Test
```bash
cd /Users/macmini/Documents/Projetos/App\ IronTracks && npx tsc --noEmit 2>&1 | grep -i "used before" | head -10
```
- TS2448 "used before its declaration" = hook ordering bug
- Fix: move the producing hook ABOVE the consuming hook

## Summary
After all steps pass, the code is ready for:
- `git add . && git commit -m "refactor(scope): description"`
- Deploy / manual testing
