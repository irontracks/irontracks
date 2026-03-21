# IronTracks — Agent Rules

## 🌐 LANGUAGE

- **ALL responses, reports, questions, explanations, and conversations** MUST be in **Brazilian Portuguese (pt-BR)**
- Code, commit messages, variable names, and technical documentation (rules, skills, workflows) remain in **English**

---

## 🚨 CRITICAL RULES (NEVER violate)

### 1. NEVER delete files with `find -delete` or `rm` with globs
- Filenames with spaces on macOS cause accidental deletions
- ALWAYS use `git rm` for tracked files, or delete one file at a time with quoted paths
- **BEFORE** any delete, list affected files and confirm

### 2. NEVER modify modals without verifying the full flow
- Modals use layered `z-index`: overlay (1200) > modal (1300) > toast (1400)
- **ALWAYS** verify the modal has:
  - Working `onClose` (X button, overlay click, ESC key)
  - `overflow-y-auto` on body for scroll on small screens
  - `max-h-[85vh]` to prevent exceeding viewport
  - `pb-safe` for iOS safe area
- **NEVER** remove `position: fixed` or `inset-0` from overlays
- **NEVER** change z-index without checking collisions with other active modals

### 3. NEVER modify state management without understanding the flow
- `IronTracksAppClientImpl.tsx` is the God Component — all global state flows through it
- `useViewNavigation.ts` controls ALL view navigation
- **BEFORE** changing any `useState`/`useEffect` in core components, trace the flow:
  1. Who sets the state?
  2. Who consumes the state?
  3. Are there dependent side effects?

### 4. NEVER do batch operations on APIs without rate limit checks
- Every new route MUST have `checkRateLimitAsync` or equivalent
- Zod schemas MUST have `.max()` on strings and arrays

### 5. NEVER interpolate variables in Supabase `.or()` or `.ilike()` without sanitization
- **ALWAYS** use `import { safePg, safePgLike } from '@/utils/safePgFilter'`
- For `.or()`: `.or(\`col.eq.${safePg(value)}\`)`
- For `.ilike()`: `.ilike('col', \`%${safePgLike(value)}%\`)`
- **WRONG**: `.or(\`col.eq.${value}\`)` or `.ilike('col', \`%${value}%\`)`

---

## ⚠️ SECURITY RULES

### 6. Notifications table inserts
- **ALWAYS** include `is_read: false` and `read: false` explicitly
- Use `insertNotifications()` from `@/lib/social/notifyFollowers` when possible (guarantees defaults)

### 7. `createAdminClient()` — RLS Bypass
- Only use when RLS prevents a legitimate operation
- **ALWAYS** verify auth BEFORE using admin client
- **ALWAYS** add comment: `// NEEDS ADMIN: [reason]`

### 8. Deletes and Updates
- `.delete()` MUST have `.eq('user_id', userId)` or equivalent ownership check
- `.update()` MUST filter by owner or have role check (admin/teacher)

### 9. Empty catch blocks
- **NEVER** write `catch {}` or `catch { }` — always log: `catch (e) { logWarn('context', 'message', e) }`
- Import `logWarn` from `@/lib/logger`

### 10. `.upsert()` MUST have explicit `onConflict`
- **NEVER** call `.upsert(data)` without specifying `{ onConflict: 'col1,col2' }`
- Without it, Supabase uses the primary key, which can silently overwrite unrelated rows

### 11. Counters MUST be incremented atomically
- **NEVER** do read-then-write for counters (race condition)
- Use `rpc('increment_counter', { table_name, column_name, row_id })` or `UPDATE SET col = col + 1`

### 12. Upload paths MUST be generated server-side
- **NEVER** let the client control the storage path — prevents path traversal attacks
- File types and sizes MUST be validated before accepting uploads

### 13. Client-provided dates MUST be clamped server-side
- **NEVER** trust dates from the client without clamping to a reasonable range
- Use `new Date(Math.min(userDate, maxAllowed))` pattern

### 14. SELECT queries MUST have `.limit()`
- **NEVER** run unbounded selects that could return thousands of rows
- Admin queries: `.limit(500)`, user queries: `.limit(100)`, search: `.limit(50)`

### 15. Use `Promise.allSettled` for non-critical batch operations
- **NEVER** use `Promise.all` for cleanup, cache invalidation, or notification sends
- If one fails, others should still complete — use `Promise.allSettled`
- `Promise.all` is OK for critical operations where all must succeed
---

## 🎨 UI/UX RULES

### 16. Premium Design System
- Background: `#0a0a0a` (deep black), cards: `rgba(15,15,15,0.98)`
- Gold gradient: `#f59e0b` → `#d97706` → `#b45309` (135deg)
- Borders: `rgba(234,179,8,0.25)` (subtle gold)
- **NEVER** use flat colors (pure red, pure blue)
- **ALWAYS** use `from '@/components/ui/PremiumUI'` for modals and buttons
- Fonts: `font-black` for titles, `text-sm` for body

### 17. Components > 500 lines
- Extract sub-components or hooks before adding more code
- Hooks > 300 lines must be decomposed

### 18. Lazy Loading
- Every heavy modal/panel MUST use `dynamic(() => import(...), { ssr: false })`
- Components using `chart.js`, `framer-motion`, or `html2canvas` MUST be lazy loaded

### 19. Images
- Use `next/image` when possible
- Accepted exceptions: dynamic avatars (Capacitor), camera previews, PDF generation

---

## 🧪 CODE QUALITY RULES

### 20. TypeScript
- **ZERO** `as any` or `: any` — use `unknown` + type guard
- Catch blocks must log: `catch (e) { logError('context', e) }`
- Zod schemas in `src/schemas/` for input validation

### 21. Error Handling
- APIs return `{ ok: boolean, error?: string }`
- Correct HTTP status codes: 401 (auth), 403 (forbidden), 429 (rate limit)
- **NEVER** expose stack traces to the client in production

### 22. Before committing
- Run `npx tsc --noEmit` for type check
- Verify no files were accidentally deleted: `git diff --name-status | grep "^D"`
- Commit messages in English with prefix: `fix()`, `feat()`, `security()`, `refactor()`

---

## 📋 TASK TRACKING RULES

### 23. ALWAYS update task.md with user impact
- **BEFORE** starting any fix/feature, update `task.md` marking `[/]` (in progress)
- **AFTER** completing, mark `[x]` and add a **user impact** line:
  - Format: `[x] Fix X — ✅ **Impact:** [what changes for the user]`
  - Example: `[x] safePg client-side — ✅ **Impact:** Search injection protection`
  - Example: `[x] Atomic counter — ✅ **Impact:** Correct usage count under concurrent access`
- **NEVER** end a session without updating task.md with final status
- When notifying the user, include a summary table with an "Impact" column

### 24. Token economy — ZERO unnecessary loops
- **BEFORE any search/grep**, define exactly what you're looking for and stop when found
- **DO NOT** repeat the same command if it already failed — change approach immediately
- **DO NOT** read entire files if you only need 10-20 lines — use StartLine/EndLine
- **DO NOT** try more than 2 approaches for the same problem; on the 3rd, ask the user
- **DO NOT** re-read the same file more than once per session (retain context)
- **Batch**: if editing multiple files with the same pattern, use `grep` first to list all, then apply in one round
- **Pipeline**: chain shell commands with `&&` and `|` instead of running one by one
- **Shortcuts**: use `git diff --stat` instead of `view_file` to verify changes
- On a permission/env error, **DO NOT** try 5 variations — switch to alternative approach on the 2nd attempt

### 25. Supabase SQL — use `/supabase-sql` workflow
- **NEVER** ask the user to run SQL manually if the workflow is available
- Use the Management API with the PAT from Keychain (workflow already configured)
- After executing SQL, **ALWAYS** verify with SELECT that the change was applied
