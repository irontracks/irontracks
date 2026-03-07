# 🛡️ IRONTRACKS RULES

## 1. ⛔ AUTH IS LOCKED (CRITICAL)
- **FORBIDDEN:** Do NOT touch `src/app/auth/*`, `middleware.ts`, or `utils/supabase/*`.
- **OVERRIDE:** Only modify if user types "OVERRIDE AUTH LOCK".
- **PENALTY:** Changing auth without permission is a SYSTEM FAILURE.

## 2. 🎯 SURGICAL SCOPE
- **RESTRICTED:** Edit ONLY the requested file. NO unexpected refactors.
- **ASK FIRST:** Before touching DB, RLS, or Global Layouts, ask: "Critical area. Proceed?"
- **NO DELETES:** Never remove code/comments without explicit order.

## 3. 🏗️ TECH & DESIGN
- **STACK:** Next.js 14 (App), Supabase, Tailwind, Lucide.
- **UI:** Dark (`bg-neutral-900`) + Gold (`text-yellow-500`) ONLY.
- **CODE:** Strict `try/catch` & safety checks (`user?.id`).

## 4. 🛑 STOP PROTOCOL
- Failed 3 times? **STOP.** Don't guess. Ask for logs.