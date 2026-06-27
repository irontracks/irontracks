const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// ── Guard: vazamento de profiles (auditoria 2026-06-27 #7, fase 1) ─────────────
// A policy profiles_read_all_authenticated (USING(true)) vazava email/marketing
// de TODA a base. A correção introduz a view public.profiles_public (só colunas
// não-sensíveis) e repointa as leituras cross-user de USUÁRIO COMUM para ela.
// Este guard garante que (a) a migration da view existe e expõe só o set seguro,
// (b) os tipos conhecem a view, (c) os sites de chat/comunidade/team leem da view
// — para não regredir de volta a `profiles` (que será trancado na fase 2).

const repoRoot = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

// (a) Migration da view
const migration = read('supabase/migrations/20260627150000_profiles_public_view.sql')
assert.ok(/create or replace view public\.profiles_public/i.test(migration), 'migration deve criar a view profiles_public')
assert.ok(/security_invoker\s*=\s*false/i.test(migration), 'view deve ser security_invoker=false (definer) para expor o subset público')
assert.ok(/grant select on public\.profiles_public to authenticated/i.test(migration), 'view deve conceder SELECT a authenticated')
// A view NÃO pode expor colunas sensíveis (checa só o SQL, sem linhas de comentário).
const migrationSql = migration
  .split('\n')
  .filter((l: string) => !l.trim().startsWith('--'))
  .join('\n')
for (const sensitive of ['email', 'acquisition_source', 'referral_code', 'approval_status', 'is_approved']) {
  assert.ok(!new RegExp(`\\b${sensitive}\\b`).test(migrationSql), `view profiles_public NÃO pode expor coluna sensível: ${sensitive}`)
}

// (b) Tipos conhecem a view
const types = read('src/types/supabase.ts')
assert.ok(/profiles_public:\s*\{/.test(types), 'src/types/supabase.ts deve declarar a view profiles_public')

// (c) Sites cross-user de usuário comum leem da view (não de profiles)
const mustUseView: Array<[string, number]> = [
  ['src/components/ChatDirectScreen.tsx', 3],
  ['src/components/ChatListScreen.tsx', 1],
  ['src/hooks/useUnreadBadges.ts', 1],
  ['src/hooks/useWorkoutFetch.ts', 1],
  ['src/hooks/useStudentControlNotice.ts', 1],
  ['src/contexts/team/useTeamInvites.ts', 2],
  ['src/app/(app)/community/useCommunityData.ts', 2],
  ['src/app/api/team/invite-candidates/route.ts', 2],
  ['src/app/api/social/gym-leaderboard/route.ts', 1],
]
for (const [rel, minHits] of mustUseView) {
  const text = read(rel)
  const hits = (text.match(/from\('profiles_public'\)/g) || []).length
  assert.ok(hits >= minHits, `${rel} deve ler de profiles_public ao menos ${minHits}x (achou ${hits}) — não regredir para profiles`)
}

process.stdout.write('ok\n')
