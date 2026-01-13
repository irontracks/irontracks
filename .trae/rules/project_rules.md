# IronTracks Project Rules

## 1. Tech Stack
- Frontend: Next.js (App Router), React, Tailwind CSS.
- Backend: Supabase (PostgreSQL).
- Icons: Lucide-React.

## 2. Design System (Strict)
- **Backgrounds:** ALWAYS Dark (bg-neutral-900 or black). NEVER white.
- **Accents:** Gold/Yellow (text-yellow-500, bg-yellow-500).
- **Cards:** Rounded-xl, dark gray background (bg-neutral-800).

## 3. Behavior & Language
- **Language:** Always respond in Portuguese (PT-BR).
- **Navigation:** Prefer Modals over page redirects.
- **Safety:** Always check for 'undefined' before mapping arrays.

## 4. Anti-Loop Protocol (CRITICAL) 🚨
- **Three Strike Rule:** If you attempt a fix or feature 3 times and it still fails or the user rejects it:
  1. **STOP** coding immediately.
  2. **ANALYZE** why the previous approach failed.
  3. **CHANGE STRATEGY:** Propose a completely different technical approach.
  - *Never repeat the exact same code block that failed previously.*