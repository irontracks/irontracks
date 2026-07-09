#!/usr/bin/env node
/**
 * IronTracks — prepara uma conta de review (Apple/Google) já existente.
 *
 * O que faz, pra conta cujo email você passar:
 *   1. Reseta a senha pro valor informado (garante match exato com a metadata
 *      da loja) e confirma o email.
 *   2. Semeia 2 treinos de exemplo se a conta estiver sem nenhum (dashboard
 *      não fica vazio pro reviewer).
 *   3. Faz um login real com a anon key pra provar que as credenciais funcionam.
 *
 * A conta PRECISA já existir (passou pelo whitelist de convite). Este script
 * não cria usuário — só prepara um que já está no sistema.
 *
 * NUNCA hardcode a senha aqui — passe por argumento/env pra não vazar no git.
 *
 * Uso (rode do repo principal, que tem .env.local + node_modules):
 *   node scripts/prepare-review-account.mjs --email apple.review@irontracks.com.br --password 'SenhaAqui'
 *   REVIEW_EMAIL=... REVIEW_PASSWORD=... node scripts/prepare-review-account.mjs
 *   ... --no-seed        # não semeia treinos
 *
 * Env necessário (.env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── env ───────────────────────────────────────────────────────────────────
const envText = await readFile(path.join(process.cwd(), '.env.local'), 'utf8').catch(() => '')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !service) {
  console.error('❌ Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

// ─── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let email = env.REVIEW_EMAIL || ''
let password = env.REVIEW_PASSWORD || ''
let seed = true
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--email') email = args[++i]
  else if (a === '--password') password = args[++i]
  else if (a === '--no-seed') seed = false
}
email = String(email || '').trim().toLowerCase()
if (!email || !password) {
  console.error('❌ Uso: --email <email> --password <senha>  (ou REVIEW_EMAIL/REVIEW_PASSWORD)')
  process.exit(1)
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

// ─── 1. Acha o UID pelo email (profiles.id == auth.users.id) ────────────────
const { data: prof, error: profErr } = await admin
  .from('profiles').select('id, display_name').eq('email', email).maybeSingle()
if (profErr) { console.error('❌ lookup profile:', profErr.message); process.exit(1) }
if (!prof) { console.error(`❌ Conta ${email} não existe (precisa já estar cadastrada).`); process.exit(1) }
const UID = prof.id
console.log(`→ Conta: ${email} (${prof.display_name || 'sem nome'}) id=${UID}`)

// ─── 2. Reset senha + confirma email ────────────────────────────────────────
const { error: upErr } = await admin.auth.admin.updateUserById(UID, { password, email_confirm: true })
if (upErr) { console.error('❌ resetPassword:', upErr.message); process.exit(1) }
console.log('✅ senha resetada + email confirmado')

// ─── 3. Semeia treinos se estiver vazio ─────────────────────────────────────
function mkEx(name, sets, reps, rpe, rest) {
  const setDetails = Array.from({ length: sets }, (_, i) => ({
    set_number: i + 1, reps: String(reps), rpe, weight: null,
    is_warmup: false, advanced_config: null, set_type: 'working',
  }))
  return { name, sets, setDetails, reps: String(reps), rpe, cadence: '2020', restTime: rest, method: 'Normal', videoUrl: null, notes: '' }
}
const mkWorkout = (title, exercises) => JSON.stringify({ workoutTitle: title, date: '2026-07-09T12:00:00.000Z', exercises })

if (seed) {
  const { count } = await admin.from('workouts').select('id', { count: 'exact', head: true })
    .eq('user_id', UID).is('archived_at', null)
  if ((count || 0) > 0) {
    console.log(`ℹ️ já tem ${count} treino(s) — não semeia`)
  } else {
    const rows = [
      { user_id: UID, created_by: UID, name: 'Treino A — Full Body', is_template: false, sort_order: 0,
        notes: mkWorkout('Treino A — Full Body', [
          mkEx('Agachamento livre', 4, 8, 8, 120), mkEx('Supino reto', 4, 8, 8, 90),
          mkEx('Remada curvada', 4, 10, 8, 90), mkEx('Desenvolvimento militar', 3, 10, 7, 90),
        ]) },
      { user_id: UID, created_by: UID, name: 'Treino B — Superiores', is_template: false, sort_order: 1,
        notes: mkWorkout('Treino B — Superiores', [
          mkEx('Puxada frente', 4, 10, 8, 90), mkEx('Rosca direta', 3, 12, 8, 60),
          mkEx('Tríceps corda', 3, 12, 8, 60), mkEx('Elevação lateral', 3, 15, 8, 45),
        ]) },
    ]
    const { error: insErr, data: ins } = await admin.from('workouts').insert(rows).select('id')
    if (insErr) { console.error('❌ seed workouts:', insErr.message); process.exit(1) }
    console.log(`✅ ${ins.length} treinos semeados`)
  }
}

// ─── 4. Prova o login como o app faz ────────────────────────────────────────
const pub = createClient(url, anon, { auth: { persistSession: false } })
const { data: sess, error: loginErr } = await pub.auth.signInWithPassword({ email, password })
if (loginErr) { console.error(`❌ LOGIN_FAIL: ${loginErr.status} ${loginErr.message}`); process.exit(2) }
console.log(`✅ LOGIN_OK (session=${Boolean(sess.session)})`)
console.log('\nConta de review pronta.')
