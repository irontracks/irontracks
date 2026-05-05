#!/usr/bin/env node
/**
 * IronTracks — Upload screenshots to App Store Connect (sem Xcode UI).
 *
 * Pré-requisito: rodar scripts/scale-appstore-shots.py antes.
 *
 * Usage:
 *   node scripts/ios-screenshots.mjs
 *   node scripts/ios-screenshots.mjs --dry-run
 */

import { readFile, existsSync, statSync, mkdirSync } from 'node:fs'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const readFileAsync = promisify(readFile)

const BASE   = path.resolve(import.meta.dirname, '..')
const SCALED = path.join(BASE, 'screenshots-appstore')
const DRY    = process.argv.includes('--dry-run')

// ─── Env ───────────────────────────────────────────────────────────────────
const envText = await readFileAsync(path.join(BASE, '.env.local'), 'utf8').catch(() => '')
for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const KEY_ID    = process.env.ASC_KEY_ID
const ISSUER_ID = process.env.ASC_ISSUER_ID
const BUNDLE_ID = 'com.irontracks.app'
const KEY_PATH  = path.join(homedir(), '.appstoreconnect', 'keys', `AuthKey_${KEY_ID}.p8`)

if (!KEY_ID || !ISSUER_ID) {
    console.error('❌  ASC_KEY_ID e ASC_ISSUER_ID obrigatórios no .env.local')
    process.exit(1)
}

const DEVICE_SIZES = {
    APP_IPHONE_69: [1320, 2868],
    APP_IPHONE_67: [1290, 2796],
    APP_IPHONE_65: [1284, 2778],
}

const SHOT_FILES = [
    'screenshot-dashboard.png',
    'screenshot-vip2.png',
    'screenshot-community.png',
    'screenshot-assessments.png',
    'screenshot-nutrition.png',
]

// ─── JWT ───────────────────────────────────────────────────────────────────
const keyPem = await readFileAsync(KEY_PATH, 'utf8')

function makeJwt() {
    const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
        iss: ISSUER_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1200,
        aud: 'appstoreconnect-v1',
    })).toString('base64url')
    const unsigned  = `${header}.${payload}`
    const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: keyPem, dsaEncoding: 'ieee-p1363' })
    return `${unsigned}.${sig.toString('base64url')}`
}

const ASC = 'https://api.appstoreconnect.apple.com'

async function api(method, pathOrUrl, body) {
    const jwt = makeJwt()
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : ASC + pathOrUrl
    const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 204) return null
    const text = await res.text()
    if (!res.ok) {
        console.error(`❌ ${method} ${url.replace(ASC,'')} → ${res.status}`)
        console.error(text.slice(0, 400))
        return null
    }
    return text ? JSON.parse(text) : null
}

async function uploadBinary(uploadOps, filePath) {
    const buf = await readFileAsync(filePath)
    for (const op of uploadOps) {
        const headers = {}
        for (const h of (op.requestHeaders ?? [])) headers[h.name] = h.value
        const chunk = op.length != null ? buf.slice(op.offset ?? 0, (op.offset ?? 0) + op.length) : buf
        const res = await fetch(op.url, {
            method: op.method ?? 'PUT',
            headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(chunk.length) },
            body: chunk,
        })
        if (!res.ok) {
            console.error(`  ❌ Upload HTTP ${res.status}`)
            return false
        }
    }
    return true
}

// ─── Main ──────────────────────────────────────────────────────────────────
console.log('\n📱  IronTracks — Upload de Screenshots para App Store\n')
console.log(`  Modo: ${DRY ? 'DRY RUN' : 'LIVE'}`)

// 1. App
console.log('\n→ Buscando app...')
const appsRes = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)
const app = appsRes?.data?.[0]
if (!app) { console.error('❌ App não encontrado'); process.exit(1) }
console.log(`  ${app.attributes.name} (id=${app.id})`)

// 2. Versão editável (qualquer estado antes de aprovado)
console.log('\n→ Buscando versão editável...')
const STATES = ['PREPARE_FOR_SUBMISSION','WAITING_FOR_REVIEW','DEVELOPER_REJECTED','REJECTED','IN_REVIEW']
let version = null
for (const state of STATES) {
    const r = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=${state}&limit=1`)
    if (r?.data?.[0]) { version = r.data[0]; console.log(`  v${version.attributes.versionString} — ${state}`); break }
}
if (!version) { console.error('❌ Nenhuma versão editável. Crie uma no App Store Connect.'); process.exit(1) }

// 3. Localização pt-BR
console.log('\n→ Localizações...')
const locRes = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)
const locale = locRes?.data?.find(l => l.attributes.locale === 'pt-BR') ?? locRes?.data?.[0]
if (!locale) { console.error('❌ Localização pt-BR não encontrada'); process.exit(1) }
console.log(`  ${locale.attributes.locale} (id=${locale.id})`)

// 4. Screenshot sets
console.log('\n→ Screenshot sets...')
const setsRes = await api('GET', `/v1/appStoreVersionLocalizations/${locale.id}/appScreenshotSets?limit=50`)
const existingSets = setsRes?.data ?? []
console.log(`  ${existingSets.length} set(s) existentes:`)
existingSets.forEach(s => console.log(`    ${s.attributes.screenshotDisplayType}`))

if (DRY) { console.log('\n⚠️  DRY RUN — encerrando sem upload.\n'); process.exit(0) }

// 5. Upload por device type
for (const [deviceType, [tw, th]] of Object.entries(DEVICE_SIZES)) {
    console.log(`\n━━━  ${deviceType} (${tw}×${th}) ━━━`)

    // Verificar se há screenshots escalados
    const folder = path.join(SCALED, deviceType)
    const available = SHOT_FILES.filter(f => {
        const scaled = f.replace('.png', `_${deviceType}.png`)
        return existsSync(path.join(folder, scaled))
    })
    if (!available.length) { console.log('  ⚠️  Nenhum screenshot escalado encontrado — rode scale-appstore-shots.py'); continue }

    // Encontrar ou criar set
    let set = existingSets.find(s => s.attributes.screenshotDisplayType === deviceType)
    if (!set) {
        console.log(`  Criando set ${deviceType}...`)
        const cr = await api('POST', '/v1/appScreenshotSets', {
            data: {
                type: 'appScreenshotSets',
                attributes: { screenshotDisplayType: deviceType },
                relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locale.id } } }
            }
        })
        if (!cr) { console.log(`  ❌ Não foi possível criar set ${deviceType}`); continue }
        set = cr.data
        console.log(`  ✓ Set criado (id=${set.id})`)
    }

    // Deletar screenshots existentes
    const existShotsRes = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=30`)
    const existShots = existShotsRes?.data ?? []
    if (existShots.length) {
        console.log(`  Deletando ${existShots.length} screenshot(s) existente(s)...`)
        for (const s of existShots) {
            await api('DELETE', `/v1/appScreenshots/${s.id}`)
            process.stdout.write('  🗑  ')
        }
        console.log()
    }

    // Upload
    let pos = 1
    for (const fname of available) {
        const scaledName = fname.replace('.png', `_${deviceType}.png`)
        const filePath   = path.join(folder, scaledName)
        const fileSize   = statSync(filePath).size

        // Reservar slot
        const reserve = await api('POST', '/v1/appScreenshots', {
            data: {
                type: 'appScreenshots',
                attributes: { fileName: scaledName, fileSize },
                relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } }
            }
        })
        if (!reserve) { console.log(`  ❌ Falha ao reservar ${fname}`); continue }

        const shotId  = reserve.data.id
        const upOps   = reserve.data.attributes.uploadOperations ?? []

        process.stdout.write(`  ⬆️  ${fname} (${upOps.length} parte(s))... `)
        const ok = await uploadBinary(upOps, filePath)
        if (!ok) { console.log('❌'); continue }

        // Commit
        const buf      = await readFileAsync(filePath)
        const checksum = crypto.createHash('md5').update(buf).digest('hex')
        const commit   = await api('PATCH', `/v1/appScreenshots/${shotId}`, {
            data: { type: 'appScreenshots', id: shotId, attributes: { sourceFileChecksum: checksum, uploaded: true } }
        })
        console.log(commit ? `✅ pos ${pos}` : '⚠️  commit incerto')
        pos++
    }
}

console.log('\n✅  Concluído! Verifique em App Store Connect → Screenshots.\n')
