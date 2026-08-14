const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// ── Guards dos achados LOW (auditoria 2026-06-27) ──────────────────────────────
const repoRoot = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

// L1 — assign-teacher: professor só atribui aluno a si mesmo
const assign = read('src/app/api/admin/students/assign-teacher/route.ts')
assert.ok(/teacher_user_id\s*!==\s*auth\.user\.id/.test(assign) && /status:\s*403/.test(assign), 'assign-teacher: professor deve ser barrado ao atribuir a outro professor')

// L9 — ensure-bucket: a rota foi REMOVIDA (SEC-06, auditoria 2026-08-13).
// Ela deixava qualquer usuário logado tornar o bucket chat-media público via
// updateBucket com service-role; o rate-limit (guard L9 original) não corrigia
// a autorização. Guard completo: src/app/api/storage/__tests__/chatMediaBucketPrivate.test.ts
assert.ok(
  !fs.existsSync(path.join(repoRoot, 'src/app/api/storage/ensure-bucket')),
  'ensure-bucket não pode voltar: qualquer usuário logado tornava o chat-media público'
)

// L3 — userContext: instrução anti prompt-injection
const ctx = read('src/utils/ai/userContext.ts')
assert.ok(/NUNCA como instruções|trate como dados/i.test(ctx), 'userContext deve instruir o modelo a tratar o bloco como dados, não comandos')

// L10 — purge-chat-media: confirm token + dryRun
const purge = read('src/app/api/storage/purge-chat-media/route.ts')
assert.ok(/'PURGE'/.test(purge) && /confirmation_required/.test(purge), 'purge deve exigir confirm:PURGE')
assert.ok(/dryRun/.test(purge), 'purge deve suportar dryRun')

// L12 — helper de erro de DB + uso no exemplo
const helper = read('src/utils/api/dbError.ts')
assert.ok(/export function respondDbError/.test(helper) && /database_error/.test(helper), 'helper respondDbError deve existir e retornar mensagem genérica')
const vip = read('src/app/api/vip/profile/route.ts')
assert.ok(/respondDbError/.test(vip) && !/error:\s*error\.message/.test(vip), 'vip/profile deve usar respondDbError (sem vazar error.message)')

process.stdout.write('ok\n')
