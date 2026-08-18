const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// ── Guards dos achados MÉDIOS (auditoria 2026-06-27) ───────────────────────────
const repoRoot = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

// M1 — team/invite/notify só dispara push com convite pendente real
const notify = read('src/app/api/team/invite/notify/route.ts')
assert.ok(/from\('invites'\)/.test(notify), 'invite/notify deve consultar a tabela invites')
assert.ok(/eq\('from_uid'/.test(notify) && /eq\('to_uid'/.test(notify) && /eq\('status',\s*'pending'\)/.test(notify), 'invite/notify deve validar convite pendente from_uid->to_uid')
assert.ok(/invite_not_found/.test(notify) && /status:\s*404/.test(notify), 'invite/notify deve retornar 404 quando não há convite')
const inviteIdx = notify.indexOf("from('invites')")
const pushIdx = notify.indexOf('sendPushToAllPlatforms([targetUserId]')
assert.ok(inviteIdx > -1 && pushIdx > -1 && inviteIdx < pushIdx, 'invite/notify deve validar o convite ANTES de disparar o push')

// M3 — push/register rejeita token de outro usuário
const register = read('src/app/api/push/register/route.ts')
assert.ok(/token_owned_by_another_user/.test(register) && /status:\s*409/.test(register), 'push/register deve rejeitar (409) token de outro user')
const checkIdx = register.indexOf('existingToken')
const upsertIdx = register.indexOf('.upsert(')
assert.ok(checkIdx > -1 && upsertIdx > -1 && checkIdx < upsertIdx, 'push/register deve checar o dono do token ANTES do upsert')

// M4 — stories/create valida cloud name + folder + userId no media_path Cloudinary
const stories = read('src/app/api/social/stories/create/route.ts')
assert.ok(/env\.cloudinary\.cloudName/.test(stories), 'stories/create deve validar o cloud name do projeto')
assert.ok(/res\.cloudinary\.com\/\$\{cloudName\}\//.test(stories), 'stories/create deve exigir o cloud name exato no prefixo da URL')
assert.ok(/irontracks\/user-uploads/.test(stories) && /auth\.user\.id/.test(stories), 'stories/create deve exigir folder e userId no public_id')

// M6 — storage/signed-upload tem allowlist de extensão e exclui svg/html
const upload = read('src/app/api/storage/signed-upload/route.ts')
assert.ok(/CHAT_MEDIA_EXT/.test(upload) && /invalid_file_type/.test(upload), 'signed-upload deve validar extensão por allowlist')
assert.ok(!/'svg'/.test(upload) && !/'html'/.test(upload), 'allowlist de chat-media NÃO pode conter svg/html')
assert.ok(/allowedMimeTypes/.test(upload) && /fileSizeLimit/.test(upload), 'signed-upload deve configurar allowedMimeTypes + fileSizeLimit no createBucket')

process.stdout.write('ok\n')
