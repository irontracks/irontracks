---
name: deep-code-review
description: Deep, systematic codebase analysis for bugs, security flaws, dead code, race conditions, IDOR, and logic issues.
---

# Deep Code Review

Skill for running a deep, systematic codebase analysis. Follow each phase in order.

## When to Use

The user asks for variations of: "do a code review", "analyze the code", "find bugs", "/code-review", "/review".

## Output Format

Generate an artifact `code_review_report.md` with score and categories. Use this template:

```markdown
# Code Review — [Project Name]

**Date:** YYYY-MM-DD
**Scope:** [files/folders analyzed]
**Global Score:** X/10

## Critical (Score 100)
### N. [Short title]
[Problem description + impact]
`path/to/file.ts:line`
**Suggested fix:** [how to resolve]

## High (Score 75)
...

## Medium (Score 50)
...

## Low (Score 25)
...

## Fix Impact Analysis

| # | Fix | Breaking? | Regression Risk | User Impact |
|---|---|---|---|---|
| 1 | [Title] | Yes/No | Low/Medium/High | [short description] |
| 2 | ... | ... | ... | ... |

### Impact Details
For each fix, detail:
- **What changes** for the end user
- **What breaks** (if anything) — and whether it's intentional
- **Regression risk** — which flows may be affected
- **Dependencies** — whether the fix depends on another

## Summary
- X critical, Y high, Z medium, W low
- Most problematic areas: [list]
```

---

## ⚠️ MANDATORY RULE: User Confirmation

**NEVER start coding fixes automatically.**

After generating the report with impact analysis:

1. **Present** the full report to the user via `notify_user` with `BlockedOnUser: true`
2. **Ask explicitly:** _"Should I fix all of them? Or would you like to select which ones?"_
3. **Wait** for the user's response before any code edits
4. If the user approves all → fix in priority order (Critical → High → Medium → Low)
5. If the user selects specific items → fix only those

---

## Phase 1 — Mapping (mandatory)

1. List the main project structure (`src/`, `app/`, etc.)
2. Identify technologies (framework, ORM, auth, storage, billing)
3. Identify authentication patterns used (middleware, guards, etc.)
4. Map API endpoints, server actions, and cron jobs

## Phase 2 — Security Analysis (Critical)

Check EVERY endpoint and server action for:

### 2.1 Authentication
- [ ] Does every route have an auth check? (getUser, requireUser, requireRole)
- [ ] Do server actions validate session before operating?
- [ ] Do cron jobs use header-based auth (not query string)?
- [ ] Do webhook endpoints validate signatures?

### 2.2 Authorization (IDOR)
- [ ] Do mutations filter by caller's `user_id`? (.eq('user_id', user.id))
- [ ] Do deletes verify ownership before executing?
- [ ] Do updates verify ownership before executing?
- [ ] Do admin endpoints check role AND ownership (teacher → own students)?

### 2.3 Injection
- [ ] Are search inputs sanitized before `.or()`, `.ilike()`, `.filter()`?
- [ ] Are client values escaped before interpolation in queries?
- [ ] Are SQL/PostgREST operators removed from input? (characters: `,().\``)
- [ ] Is `safePg()` used for `.or()` and `safePgLike()` for `.ilike()`?

### 2.4 Upload / Storage
- [ ] Are upload paths generated server-side? (not client-controlled)
- [ ] Are file types and sizes validated?

### 2.5 Rate Limiting & DoS
- [ ] Do endpoints calling external APIs (AI, billing) have rate limits?
- [ ] Do input schemas have `.max()` for strings and arrays?
- [ ] Do search endpoints limit results? (.limit())

## Phase 3 — Data Integrity

### 3.1 Race Conditions
- [ ] Are read-then-write operations atomic? (INSERT ON CONFLICT, optimistic lock, RPC)
- [ ] Are billing/subscription operations idempotent?
- [ ] Are counters incremented atomically? (use `increment_counter` RPC)

### 3.2 Input Validation
- [ ] Are client-provided dates clamped server-side?
- [ ] Are enums validated against a fixed list?
- [ ] Are UUIDs validated before use in queries?

### 3.3 Consistency
- [ ] Are delete cascades complete? (workout → exercises → sets)
- [ ] Do updates in one table reflect in related tables?
- [ ] Do cancellations revoke entitlements?

## Phase 4 — Dead Code & Dead Logic

### 4.1 Variables and Flags
- [ ] Are variables assigned and read correctly? (e.g., flag = false inside catch, if(flag) never true)
- [ ] Are guards and early returns effective?
- [ ] Are there variables declared but never read?

### 4.2 Imports and Exports
- [ ] Are there unused imports?
- [ ] Are there exports that no other file imports?
- [ ] Are there functions defined but never called?

### 4.3 Impossible Conditions
- [ ] Are there if/else branches that never execute?
- [ ] Are there empty catch blocks swallowing errors?
- [ ] Are there default cases masking bugs?

## Phase 5 — Performance & Cache

### 5.1 Queries
- [ ] N+1 queries in loops?
- [ ] Selects without pagination that can return thousands of rows?
- [ ] Queries without indexes on filtered columns?

### 5.2 Cache
- [ ] Are cache keys unique per user? (prevent cross-user leakage)
- [ ] Is cache invalidated after mutations?
- [ ] Is TTL reasonable?

### 5.3 Memory
- [ ] Large arrays in memory without streaming?
- [ ] JSON.stringify/parse on very large objects?

## Phase 6 — Code Patterns

### 6.1 Error Handling
- [ ] Do catch blocks log errors? (no empty catch)
- [ ] Do errors return correct HTTP status?
- [ ] Are DB errors handled before returning to client?

### 6.2 TypeScript
- [ ] Excessive use of `any`?
- [ ] Type assertions without validation (`as Type` without check)?
- [ ] Optional properties accessed without null check?

### 6.3 Naming & Columns
- [ ] Do column names match the actual DB schema?
- [ ] Are there typos in field names? (`read` vs `is_read`)

## Phase 7 — Infrastructure

### 7.1 Env Vars
- [ ] Are secrets not hardcoded?
- [ ] Are env var fallbacks safe?

### 7.2 Realtime / WebSockets
- [ ] Do realtime handlers validate payload before applying state?
- [ ] Do partial payloads not zero out existing data?

### 7.3 Offline / Mobile
- [ ] Does Capacitor config support offline?
- [ ] Are unknown offline jobs logged (not silenced)?
- [ ] Do loading states have a safety timeout?

---

## Scoring

| Severity | Score | Criteria |
|----------|-------|---------|
| Critical | 100 | Auth bypass, data leak, injection, data loss |
| High | 75 | Confirmed bug affecting users in production |
| Medium | 50 | Code smell, poor performance, hard maintenance |
| Low | 25 | Style, naming, dead import, optional improvement |

## Execution Tips

1. **Prioritize API routes and server actions** — they are the attack surface
2. **Grep for dangerous patterns:**
   - `.or(` + interpolated variable without `safePg` → injection
   - `.ilike(` + interpolated variable without `safePgLike` → injection
   - `.delete()` or `.update()` without `.eq('user_id'` → IDOR
   - `catch {}` or `catch { }` → swallowed errors
   - `createAdminClient()` in normal routes → RLS bypass
   - `req.body` or `body.` without sanitization → input trust
   - `.upsert(` without `onConflict` → silent data overwrites
   - `Promise.all(` in non-critical batch ops → partial failures
3. **Compare Zod schemas with actual DB columns**
4. **Check if client-side can control server-side values** (paths, IDs, dates)
5. **Do not report false positives** — confirm each finding by reading surrounding code
6. **ALWAYS include the Fix Impact Analysis table** in the report
7. **ALWAYS ask the user** before starting to code any fix
