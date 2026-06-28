const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

const entitlementRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'vip', 'entitlement', 'route.ts')
assert.ok(fs.existsSync(entitlementRoute), 'admin entitlement route missing')
const entitlementText = fs.readFileSync(entitlementRoute, 'utf8')
assert.ok(entitlementText.includes('requireRoleOrBearer'), 'admin entitlement route must require admin role with bearer fallback')
assert.ok(entitlementText.includes("['admin']"), 'admin entitlement route must restrict to admin role')

const deleteTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'teachers', 'delete', 'route.ts')
assert.ok(fs.existsSync(deleteTeacherRoute), 'teachers/delete route missing')
const deleteTeacherText = fs.readFileSync(deleteTeacherRoute, 'utf8')
assert.ok(deleteTeacherText.includes('requireRoleOrBearer'), 'teachers/delete should support bearer fallback')

// ── IDOR destrutivo guard (auditoria 2026-06-27) ───────────────────────────
// teachers/delete apaga profile + auth.users + dados em cascata via RPC.
// Aceitar role 'teacher' permitia que QUALQUER professor deletasse QUALQUER
// outro professor passando um `id` arbitrário no body. Deve ser admin-only.
assert.ok(
  /requireRoleOrBearer\(\s*req\s*,\s*\[\s*'admin'\s*\]\s*\)/.test(deleteTeacherText),
  'teachers/delete must restrict to ["admin"] only',
)
assert.ok(
  !/\[\s*'admin'\s*,\s*'teacher'\s*\]/.test(deleteTeacherText),
  'teachers/delete must NOT allow role "teacher" — reintroduz IDOR destrutivo',
)

// ── Coach AI IDOR guard (auditoria 2026-06-27) ─────────────────────────────
// Rotas de IA que recebem `studentId` e leem perfil/avaliações/EXAMES via
// service-role precisam autorizar o vínculo (self/professor/admin) com
// canCoachStudent. Sem isso, qualquer usuário autenticado exfiltrava dados de
// saúde de terceiros (IDOR).
for (const rel of [
  ['src', 'app', 'api', 'ai', 'student-workout', 'route.ts'],
  ['src', 'app', 'api', 'ai', 'assessment-report', 'route.ts'],
]) {
  const routePath = path.join(repoRoot, ...rel)
  assert.ok(fs.existsSync(routePath), `${rel.join('/')} missing`)
  const text = fs.readFileSync(routePath, 'utf8')
  assert.ok(text.includes('canCoachStudent'), `${rel.join('/')} must authorize studentId via canCoachStudent`)
  assert.ok(/status:\s*403/.test(text), `${rel.join('/')} must return 403 when access is denied`)
}

// ── Relatório público → privado guard (auditoria 2026-06-27) ───────────────
// /relatorio/[userId] expunha email + composição corporal + nutrição +
// marcadores de exame a QUALQUER anônimo por enumeração de UUID. Agora exige
// login + ownership (dono/professor/admin) ANTES de qualquer fetch de dados.
const relatorioPage = path.join(repoRoot, 'src', 'app', 'relatorio', '[userId]', 'page.tsx')
assert.ok(fs.existsSync(relatorioPage), 'relatorio page missing')
const relatorioText = fs.readFileSync(relatorioPage, 'utf8')
assert.ok(relatorioText.includes('auth.getUser()'), 'relatorio page must authenticate the viewer')
assert.ok(relatorioText.includes('canCoachStudent'), 'relatorio page must authorize the viewer via ownership (canCoachStudent)')
// O gate de authz (canCoachStudent) deve rodar ANTES do fetch em massa (Promise.all).
const gateIdx = relatorioText.indexOf('canCoachStudent')
const fetchIdx = relatorioText.indexOf('Promise.all')
assert.ok(gateIdx > -1 && fetchIdx > -1 && gateIdx < fetchIdx, 'relatorio auth gate must run BEFORE the bulk data fetch')
// generateMetadata não pode vazar identidade via OG/unfurl (bot anônimo ignora o gate).
assert.ok(!/title:\s*`Relatório — \$\{name\}/.test(relatorioText), 'relatorio generateMetadata must not leak the user name in the title')

// ── Recurring "students" bug guard ─────────────────────────────────────────
// Two errors kept regressing because every admin route reinvented student
// lookup:
//   1. "null value in column 'name' of relation 'students'" — INSERT path
//      forgot to fill `name` (NOT NULL).
//   2. "student_not_found" — AdminUser.id is "pending_<uuid>" (profile
//      fallback) and the route only knew how to match students.id.
//
// Both must go through src/utils/admin/resolveStudent.ts, which:
//   - strips the "pending_" prefix
//   - falls back across id → user_id → email
//   - auto-creates a `students` row with a guaranteed non-null `name`
//     derived from display_name → email local-part → email → "Aluno".
//
// If you delete or bypass the helper, this test fails and the bug returns.

const resolveStudentHelper = path.join(repoRoot, 'src', 'utils', 'admin', 'resolveStudent.ts')
assert.ok(fs.existsSync(resolveStudentHelper), 'resolveStudent helper missing — recurring students bug guard')
const resolveStudentText = fs.readFileSync(resolveStudentHelper, 'utf8')
assert.ok(resolveStudentText.includes('unwrapPendingId'), 'resolveStudent must export unwrapPendingId to handle "pending_<uuid>" AdminUser ids')
assert.ok(resolveStudentText.includes("'pending_'"), 'resolveStudent must strip the "pending_" prefix')
assert.ok(/name:\s*deriveName\(/.test(resolveStudentText), 'resolveStudent INSERT must use deriveName to guarantee non-null name')
assert.ok(/return 'Aluno'/.test(resolveStudentText), 'deriveName must have a final non-empty fallback')

const studentStatusRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'students', 'status', 'route.ts')
const studentStatusText = fs.readFileSync(studentStatusRoute, 'utf8')
assert.ok(studentStatusText.includes('resolveStudentRow'), 'students/status must use the shared resolveStudentRow helper')
assert.ok(!/eq\('id',\s*id\)/.test(studentStatusText), 'students/status must not do raw eq("id", id) lookup — use resolveStudentRow')

const assignTeacherRoute = path.join(repoRoot, 'src', 'app', 'api', 'admin', 'students', 'assign-teacher', 'route.ts')
const assignTeacherText = fs.readFileSync(assignTeacherRoute, 'utf8')
assert.ok(assignTeacherText.includes('resolveStudentRow'), 'students/assign-teacher must use the shared resolveStudentRow helper')
assert.ok(!/from\('students'\)\s*\.insert\(\s*\{\s*email/.test(assignTeacherText), 'students/assign-teacher must not INSERT directly — use resolveStudentRow which guarantees name is filled')

// ── Privilege-escalation guard: teachers/accept (auditoria 2026-06-27) ─────
// O endpoint setava profiles.role='teacher' INCONDICIONALMENTE → qualquer
// usuário virava professor com um POST. Deve gated na existência de um registro
// `teachers` legítimo (promover só depois de confirmar), negando com 403.
const acceptRoute = path.join(repoRoot, 'src', 'app', 'api', 'teachers', 'accept', 'route.ts')
const acceptText = fs.readFileSync(acceptRoute, 'utf8')
const denyIdx = acceptText.indexOf('not_a_teacher')
const promoteIdx = acceptText.indexOf("role: 'teacher'")
assert.ok(denyIdx > -1, 'teachers/accept must deny non-teachers with not_a_teacher (403)')
assert.ok(promoteIdx > -1 && denyIdx < promoteIdx, 'teachers/accept must check teacher membership BEFORE promoting profiles.role')
assert.ok(/status:\s*403/.test(acceptText), 'teachers/accept must return 403 when no teacher record exists')

// ── Write-IDOR guard: team/chat/notify (auditoria 2026-06-27) ──────────────
// Qualquer autenticado inseria mensagem em sessão alheia + push spam. Deve
// validar membership (isTeamSessionMember) ANTES de inserir em team_chat_messages.
const notifyRoute = path.join(repoRoot, 'src', 'app', 'api', 'team', 'chat', 'notify', 'route.ts')
const notifyText = fs.readFileSync(notifyRoute, 'utf8')
const memberIdx = notifyText.indexOf('isTeamSessionMember')
const insertIdx = notifyText.indexOf("from('team_chat_messages')")
assert.ok(memberIdx > -1, 'team/chat/notify must validate membership via isTeamSessionMember')
assert.ok(insertIdx > -1 && memberIdx < insertIdx, 'team/chat/notify must check membership BEFORE inserting the message')
assert.ok(/status:\s*403/.test(notifyText), 'team/chat/notify must return 403 for non-members')

process.stdout.write('ok\n')

