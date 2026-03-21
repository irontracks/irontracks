---
name: multi-agent-coordination
description: Coordination of multiple agents working in parallel on IronTracks, each in an isolated sector to avoid file conflicts.
---

# Multi-Agent Coordination — IronTracks

## Concept
Split the project into **5 isolated sectors** so up to 5 agents can work in parallel, each in its own conversation, without file conflicts.

## The 5 Sectors

### 🏋️ Sector 1: Workout Engine
**Scope:** Everything related to active training and session logic.
**Exclusive files:**
- `src/components/workout/**`
- `src/components/ActiveWorkout.tsx`
- `src/lib/finishWorkoutPayload.ts`
- `src/lib/workoutSafetyNet.ts`
- `src/hooks/useSessionSync.ts`
- `src/hooks/useLocalPersistence.ts`
- `src/hooks/useWorkoutRecovery.ts`
- `src/app/api/workouts/**`

### 📊 Sector 2: Dashboard & UI
**Scope:** Dashboard, visual components, layout, navigation.
**Exclusive files:**
- `src/components/dashboard/**`
- `src/components/ui/**`
- `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
- `src/components/WorkoutReport.tsx`
- `src/components/workout-report/**`
- `src/components/ProfilePage.tsx`
- `src/components/SettingsModal.tsx`

### 🔐 Sector 3: Auth, API & Backend
**Scope:** Authentication, APIs, server actions, middleware.
**Exclusive files:**
- `src/app/api/**` (except `/api/workouts/`)
- `src/actions/**`
- `src/middleware.ts`
- `src/utils/supabase/**`
- `src/lib/logger.ts`
- `src/lib/redis*.ts`
- `supabase/**`

### 🤝 Sector 4: Social & Community
**Scope:** Chat, stories, teams, invites, notifications.
**Exclusive files:**
- `src/components/Chat*.tsx`
- `src/components/Story*.tsx`
- `src/components/Team*.tsx`
- `src/components/Invite*.tsx`
- `src/components/Notification*.tsx`
- `src/contexts/TeamWorkoutContext.tsx`
- `src/app/(app)/community/**`
- `src/hooks/useTeam*.ts`

### 📱 Sector 5: Mobile, PWA & Build
**Scope:** Capacitor, service worker, native builds, deploy.
**Exclusive files:**
- `ios/**`
- `android/**`
- `capacitor.config.ts`
- `public/sw.js`
- `next.config.ts`
- `package.json`
- `.github/**`

## Shared Files (⚠️ Conflict Zone)
These files may be touched by multiple sectors. **Only ONE agent** should edit them at a time:
- `src/types/app.ts` — global types
- `src/utils/*.ts` — utilities (especially `safePgFilter.ts`, `cache.ts`)
- `src/hooks/use*.ts` — generic hooks
- `tailwind.config.ts` / `globals.css`
- `.agent/rules/RULES.md` — agent rules

## How to Use (Workflow)

### Step 1: Open up to 5 conversations
Open separate conversations in your IDE, one per sector.

### Step 2: Initialization prompt
Paste the following prompt **adapted for each sector**:

```
You are the agent responsible for Sector [N]: [SECTOR NAME] in IronTracks.

RULES:
1. You may ONLY edit files within your scope (listed below)
2. If you need to change a file outside your scope, STOP and ask for authorization
3. Run git pull before starting any work
4. Make frequent commits with prefix: [sector-N]
5. DO NOT edit shared files without confirming first
6. Follow all rules in .agent/rules/RULES.md

Your file scope:
[LIST SECTOR FILES]

Current task:
[DESCRIBE THE TASK]
```

### Step 3: Coordination
- Each agent runs `git pull` before starting
- Commits with prefix: `[sector-1] feat: ...`, `[sector-2] fix: ...`
- If two sectors need the same file → one waits for the other to finish
- On completion, each agent pushes

### Step 4: Merge
After all agents finish, do a final pull and resolve conflicts (if any).

## Limitations
- There is no automatic orchestration between agents
- Each conversation is independent — agents do not communicate with each other
- Git conflicts are possible on shared files
- The user is the "Project Manager" who coordinates the agents

## Practical Example
```
Conversation 1: "Sector 1 Agent, implement auto-save for active workout"
Conversation 2: "Sector 2 Agent, redesign the Iron Rank card"
Conversation 3: "Sector 3 Agent, optimize Supabase queries"
Conversation 4: "Sector 4 Agent, implement story reactions"
Conversation 5: "Sector 5 Agent, configure push notifications on Android"
```

All 5 tasks run in parallel without file conflicts.
