#!/usr/bin/env node
/**
 * IronTracks — Submit latest AAB to Google Play Internal Testing (no UI).
 *
 * Espelho do scripts/ios-submit.mjs, mas pra Android via Google Play Developer API v3.
 *
 * Fluxo:
 *   1. Autentica via service account JSON (JWT → access_token OAuth2)
 *   2. Cria um Edit em applications/{package}/edits
 *   3. Faz upload do AAB via uploadType=media
 *   4. Atribui a versão ao track (default: internal)
 *   5. Commit do edit
 *
 * Uso:
 *   node scripts/android-submit.mjs                                 # último AAB em build/outputs
 *   node scripts/android-submit.mjs --aab path/to/app-release.aab
 *   node scripts/android-submit.mjs --track production              # default: internal
 *   node scripts/android-submit.mjs --dry-run
 *
 * Setup obrigatório (uma vez):
 *   1. Google Cloud Console → criar service account, conceder role "Service Account User"
 *   2. Google Play Console → API access → vincular essa service account
 *   3. Permissão: pelo menos "Release apps to testing tracks"
 *   4. Download da key JSON → ~/.googlecloud/service-accounts/irontracks-play.json
 *   5. .env.local: GOOGLE_PLAY_SERVICE_ACCOUNT=/Users/.../irontracks-play.json
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

// ─── Parse env ──────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local')
const envText = await readFile(envPath, 'utf8').catch(() => '')
for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const PACKAGE_NAME = 'com.irontracks.app'
const SA_PATH = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT
    || path.join(homedir(), '.googlecloud', 'service-accounts', 'irontracks-play.json')

// ─── Parse CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let dryRun = false
let aabPath = null
let track = 'internal'

for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--aab') aabPath = args[++i]
    else if (a === '--track') track = args[++i]
}

if (!aabPath) {
    aabPath = path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
}

// Validate
try { await stat(aabPath) } catch {
    console.error(`❌ AAB não encontrado: ${aabPath}`)
    console.error('   Gere primeiro: bash scripts/android-release.sh')
    process.exit(1)
}

let saJson
try {
    saJson = JSON.parse(await readFile(SA_PATH, 'utf8'))
} catch (e) {
    console.error(`❌ Service account JSON não encontrado em: ${SA_PATH}`)
    console.error('   Crie em Google Cloud Console → IAM → Service Accounts')
    console.error('   Setup completo: MOBILE_AUDIT_SETUP_ANDROID.md')
    process.exit(1)
}

console.log('Config:')
console.log('  Package:', PACKAGE_NAME)
console.log('  AAB    :', aabPath)
console.log('  Track  :', track)
console.log('  SA     :', saJson.client_email)
console.log('  Mode   :', dryRun ? 'DRY RUN' : 'LIVE SUBMIT')
console.log('')

// ─── Auth: JWT → OAuth2 access token ────────────────────────────────────────
function makeJwtAssertion() {
    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
        iss: saJson.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })).toString('base64url')
    const unsigned = `${header}.${payload}`
    const signature = crypto.sign('sha256', Buffer.from(unsigned), saJson.private_key)
    return `${unsigned}.${signature.toString('base64url')}`
}

console.log('→ Authenticating with Google OAuth2...')
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: makeJwtAssertion(),
    }),
})
const tokenJson = await tokenRes.json()
if (!tokenJson.access_token) {
    console.error('❌ Falha na autenticação:', tokenJson)
    process.exit(1)
}
const accessToken = tokenJson.access_token
console.log('  ✅ Token OAuth2 obtido')

const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3'

async function api(method, urlPath, body, contentType = 'application/json') {
    const url = urlPath.startsWith('http') ? urlPath : PUBLISHER + urlPath
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
    }
    const res = await fetch(url, {
        method,
        headers,
        body: body && contentType === 'application/json' ? JSON.stringify(body) : body,
    })
    const text = await res.text()
    if (!res.ok) {
        console.error(`❌ ${method} ${urlPath} → ${res.status}`)
        console.error(text)
        process.exit(1)
    }
    return text ? JSON.parse(text) : null
}

if (dryRun) {
    console.log('  [DRY-RUN] would create edit, upload AAB, assign to track, commit')
    process.exit(0)
}

// ─── 1. Criar Edit ──────────────────────────────────────────────────────────
console.log('→ Criando edit...')
const edit = await api('POST', `/applications/${PACKAGE_NAME}/edits`, {})
const editId = edit.id
console.log(`  edit id=${editId}`)

// ─── 2. Upload AAB ──────────────────────────────────────────────────────────
console.log('→ Subindo AAB...')
const aabBytes = await readFile(aabPath)
const uploadUrl = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}/bundles?uploadType=media`
const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
    },
    body: aabBytes,
})
const uploadText = await uploadRes.text()
if (!uploadRes.ok) {
    console.error(`❌ Upload AAB → ${uploadRes.status}`)
    console.error(uploadText)
    process.exit(1)
}
const bundle = JSON.parse(uploadText)
console.log(`  versionCode=${bundle.versionCode}, sha1=${bundle.sha1?.slice(0, 12)}...`)

// ─── 3. Atribuir ao track ───────────────────────────────────────────────────
console.log(`→ Atribuindo versionCode ${bundle.versionCode} ao track '${track}'...`)
await api('PUT', `/applications/${PACKAGE_NAME}/edits/${editId}/tracks/${track}`, {
    track,
    releases: [{
        status: 'completed',
        versionCodes: [String(bundle.versionCode)],
    }],
})
console.log('  ✅ Track atualizado')

// ─── 4. Commit edit ─────────────────────────────────────────────────────────
console.log('→ Commitando edit...')
await api('POST', `/applications/${PACKAGE_NAME}/edits/${editId}:commit`, {})
console.log('  ✅ Edit commitado')

console.log('')
console.log(`✅ AAB versionCode ${bundle.versionCode} enviado pro Play Console (track=${track}).`)
if (track === 'internal') {
    console.log('   Vai aparecer pra testers internos em ~10 min.')
    console.log('   Pra promover pra Open Testing/Production, use o Play Console UI.')
}
