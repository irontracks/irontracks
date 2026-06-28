const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// ── Guard: bucket de bioimpedância privado + signed-read (auditoria 2026-06-27 M2/M5)
const repoRoot = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

// 1) Upload: bucket PRIVADO, sem URL pública
const upload = read('src/app/api/assessment/bia-attachment/signed-upload/route.ts')
assert.ok(/public:\s*false/.test(upload), 'bia signed-upload deve criar/atualizar o bucket como public:false')
assert.ok(!/public:\s*true/.test(upload), 'bia signed-upload NÃO pode usar public:true')
assert.ok(!/getPublicUrl/.test(upload) && !/publicUrl/.test(upload), 'bia signed-upload NÃO pode retornar URL pública')

// 2) Read endpoint: signed URL com ownership
const signedUrl = read('src/app/api/assessment/bia-attachment/signed-url/route.ts')
assert.ok(/canAccessBiaPath/.test(signedUrl) && /createSignedUrl/.test(signedUrl), 'signed-url deve autorizar (canAccessBiaPath) e mintar signed URL')
assert.ok(/status:\s*403/.test(signedUrl), 'signed-url deve retornar 403 para não-autorizado')

// 3) Helper de acesso
const access = read('src/utils/storage/biaAttachmentAccess.ts')
assert.ok(/export async function canAccessBiaPath/.test(access) && /biaPathOwner/.test(access), 'helper canAccessBiaPath/biaPathOwner deve existir')

// 4) bia-extract: path + download via SDK, sem fetch/SSRF
const extract = read('src/app/api/ai/bia-extract/route.ts')
assert.ok(/path:\s*z\.string/.test(extract) && !/url:\s*z\.string\(\)\.url\(\)/.test(extract), 'bia-extract deve receber path, não url')
assert.ok(/\.download\(/.test(extract) && /canAccessBiaPath/.test(extract), 'bia-extract deve baixar via storage SDK com ownership')
assert.ok(!/isAllowedAttachmentUrl/.test(extract) && !/fetch\(url/.test(extract), 'bia-extract NÃO pode mais fazer fetch de URL externa (SSRF eliminado)')

// 5) Client: abre via signed URL, armazena path
const input = read('src/components/assessment/BIAAttachmentInput.tsx')
assert.ok(/getBiaSignedUrl/.test(input) && /onChange\(res\.path\)/.test(input), 'BIAAttachmentInput deve armazenar path e abrir via signed URL')
assert.ok(!/href=\{value\}/.test(input), 'BIAAttachmentInput NÃO pode abrir o anexo via <a href> direto')

const listItem = read('src/components/assessment/AssessmentListItem.tsx')
assert.ok(/openBiaAttachment/.test(listItem) && /getBiaSignedUrl/.test(listItem), 'AssessmentListItem deve abrir o anexo via signed URL')
assert.ok(!/href=\{attachment\}/.test(listItem), 'AssessmentListItem NÃO pode abrir o anexo via <a href> direto')

process.stdout.write('ok\n')
