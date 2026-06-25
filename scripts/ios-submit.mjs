#!/usr/bin/env node
/**
 * IronTracks — Submit latest TestFlight build to App Store review (no Xcode UI).
 *
 * What it does:
 *   1. Authenticates with App Store Connect API via .p8 + Key ID + Issuer ID
 *   2. Finds the latest uploaded build (defaults to highest processed build)
 *   3. Finds or creates an App Store version in editable state
 *   4. Updates release notes ("Novidades") in pt-BR
 *   5. Attaches the build to the version
 *   6. Submits for App Store review (auto-release after approval)
 *
 * Usage:
 *   node scripts/ios-submit.mjs                              # release notes default
 *   node scripts/ios-submit.mjs "Notas customizadas"         # custom notes
 *   node scripts/ios-submit.mjs --build 19 "Notas"           # specific build number
 *   node scripts/ios-submit.mjs --dry-run                    # don't actually submit
 *
 * Required env (in .env.local):
 *   ASC_KEY_ID=...
 *   ASC_ISSUER_ID=...
 * Plus the .p8 at ~/.appstoreconnect/keys/AuthKey_<KEY_ID>.p8
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

// ─── Parse env ─────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local')
const envText = await readFile(envPath, 'utf8').catch(() => '')
for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER_ID = process.env.ASC_ISSUER_ID
const BUNDLE_ID = 'com.irontracks.app'
const KEY_PATH = path.join(homedir(), '.appstoreconnect', 'keys', `AuthKey_${KEY_ID}.p8`)

if (!KEY_ID || !ISSUER_ID) {
    console.error('❌ ASC_KEY_ID and ASC_ISSUER_ID required in .env.local')
    process.exit(1)
}

// ─── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let dryRun = false
let noSubmit = false
let targetBuildNumber = null
let releaseNotes = null

for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--no-submit') noSubmit = true // aplica metadata/notas, NÃO submete
    else if (a === '--build') targetBuildNumber = args[++i]
    else if (!releaseNotes) releaseNotes = a
}

releaseNotes ??= 'Melhorias de performance, correções de bugs e ajustes nas notificações.'

console.log('Config:')
console.log('  Key ID:', KEY_ID)
console.log('  Bundle:', BUNDLE_ID)
console.log('  Build :', targetBuildNumber || '(latest processed)')
console.log('  Notes :', releaseNotes)
console.log('  Mode  :', dryRun ? 'DRY RUN (no submission)' : 'LIVE SUBMIT')
console.log('')

// ─── JWT ───────────────────────────────────────────────────────────────────
const keyPem = await readFile(KEY_PATH, 'utf8')
function makeJwt() {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
        iss: ISSUER_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1200,
        aud: 'appstoreconnect-v1',
    })).toString('base64url')
    const unsigned = `${header}.${payload}`
    const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: keyPem, dsaEncoding: 'ieee-p1363' })
    return `${unsigned}.${signature.toString('base64url')}`
}

const jwt = makeJwt()
const ASC = 'https://api.appstoreconnect.apple.com'

async function api(method, pathOrUrl, body) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : ASC + pathOrUrl
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
        console.error(`❌ ${method} ${pathOrUrl} → ${res.status}`)
        console.error(text)
        process.exit(1)
    }
    return text ? JSON.parse(text) : null
}

// ─── 1. Find the app ───────────────────────────────────────────────────────
console.log('→ Finding app...')
const appsRes = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)
const app = appsRes.data?.[0]
if (!app) { console.error('❌ App not found'); process.exit(1) }
console.log(`  App: ${app.attributes.name} (id=${app.id})`)

// ─── 2. Find the build ─────────────────────────────────────────────────────
console.log('→ Finding build...')
const buildsQuery = targetBuildNumber
    ? `?filter[app]=${app.id}&filter[version]=${targetBuildNumber}&filter[preReleaseVersion.platform]=IOS`
    : `?filter[app]=${app.id}&filter[preReleaseVersion.platform]=IOS&sort=-uploadedDate&limit=10`

const buildsRes = await api('GET', `/v1/builds${buildsQuery}`)
const builds = buildsRes.data || []
if (!builds.length) { console.error('❌ No builds found'); process.exit(1) }

// Pick the highest-build-number that's processed
const sorted = builds.slice().sort((a, b) =>
    parseInt(b.attributes.version) - parseInt(a.attributes.version))

let build = null
for (const b of sorted) {
    const state = b.attributes.processingState
    console.log(`  Build ${b.attributes.version} — ${state}`)
    if (state === 'VALID' && !build) build = b
}
if (!build) {
    console.error('❌ No processed build available — wait a few minutes after upload')
    process.exit(1)
}
console.log(`  → Using build ${build.attributes.version} (id=${build.id})`)

// ─── 3. Find or create editable App Store version ──────────────────────────
console.log('→ Looking for editable App Store version...')
const versionsRes = await api('GET',
    `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`)
const editableStates = new Set([
    'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED',
    'INVALID_BINARY', 'WAITING_FOR_REVIEW', 'DEVELOPER_REMOVED_FROM_SALE',
])
let version = (versionsRes.data || []).find(v => editableStates.has(v.attributes.appStoreState))

if (version) {
    console.log(`  Found editable version: ${version.attributes.versionString} (state=${version.attributes.appStoreState})`)
} else {
    // Use the build's marketing version if it doesn't yet exist on the store; otherwise bump patch.
    const preReleaseVersionRes = await api('GET', `/v1/builds/${build.id}/preReleaseVersion`)
    const buildMarketingVersion = preReleaseVersionRes.data?.attributes?.version || '1.7'

    const existingVersionStrings = new Set((versionsRes.data || []).map(v => v.attributes.versionString))

    let marketingVersion = buildMarketingVersion
    if (existingVersionStrings.has(marketingVersion)) {
        // Bump patch until we find an unused version
        const [maj, min, patch] = marketingVersion.split('.').map(n => parseInt(n) || 0)
        let next = (patch || 0) + 1
        while (existingVersionStrings.has(`${maj}.${min}.${next}`)) next++
        marketingVersion = `${maj}.${min}.${next}`
        console.log(`  ${buildMarketingVersion} already exists. Bumping → ${marketingVersion}`)
    } else {
        console.log(`  Build's marketing version ${marketingVersion} is new on store, using it`)
    }
    console.log(`  Creating new App Store version ${marketingVersion}...`)
    if (dryRun) {
        console.log('  [DRY-RUN] would create version', marketingVersion)
        process.exit(0)
    }
    const createRes = await api('POST', '/v1/appStoreVersions', {
        data: {
            type: 'appStoreVersions',
            attributes: {
                platform: 'IOS',
                versionString: marketingVersion,
                releaseType: 'AFTER_APPROVAL',
            },
            relationships: {
                app: { data: { type: 'apps', id: app.id } },
            },
        },
    })
    version = createRes.data
    console.log(`  Created: ${version.attributes.versionString} (id=${version.id})`)
}

// ─── 4. Update release notes (pt-BR localization) ──────────────────────────
console.log('→ Updating release notes (pt-BR)...')
const localizationsRes = await api('GET',
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)
const ptBr = (localizationsRes.data || []).find(l => l.attributes.locale === 'pt-BR')
    || (localizationsRes.data || []).find(l => l.attributes.locale.startsWith('pt'))
    || localizationsRes.data?.[0]

if (!ptBr) {
    console.error('❌ No localization found on version')
    process.exit(1)
}

console.log(`  Locale: ${ptBr.attributes.locale}`)
if (dryRun) {
    console.log('  [DRY-RUN] would set whatsNew:', releaseNotes)
} else {
    await api('PATCH', `/v1/appStoreVersionLocalizations/${ptBr.id}`, {
        data: {
            type: 'appStoreVersionLocalizations',
            id: ptBr.id,
            attributes: { whatsNew: releaseNotes },
        },
    })
    console.log('  ✅ Release notes updated')
}

// ─── 4b. Garante o link dos Termos de Uso (EULA) na descrição ───────────────
// Apple Guideline 3.1.2: apps com assinatura auto-renovável precisam de um link
// FUNCIONAL pros Termos de Uso (EULA) na metadata, senão a review é rejeitada.
// O app não tem EULA próprio → usamos o EULA padrão da Apple (que a própria
// mensagem de rejeição indica como válido). Aplicado em TODAS as localizações.
const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const hasEulaLink = (s) => /stdeula|termos de uso|terms of use|\beula\b/i.test(String(s || ''))
console.log('→ Garantindo link dos Termos de Uso (EULA) na descrição...')
for (const loc of (localizationsRes.data || [])) {
    const desc = String(loc.attributes.description || '')
    if (hasEulaLink(desc)) {
        console.log(`  ${loc.attributes.locale}: já tem link de Termos — ok`)
        continue
    }
    const newDesc = `${desc.trimEnd()}\n\nTermos de Uso (EULA): ${EULA_URL}`
    if (newDesc.length > 4000) {
        console.log(`  ⚠️ ${loc.attributes.locale}: descrição ficaria > 4000 chars — pulando (ajuste manual)`)
        continue
    }
    if (dryRun) {
        console.log(`  [DRY-RUN] ${loc.attributes.locale}: anexaria link do EULA`)
    } else {
        await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
            data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { description: newDesc } },
        })
        console.log(`  ✅ ${loc.attributes.locale}: link do EULA adicionado`)
    }
}

// ─── 4c. Privacy Policy URL na metadata (appInfoLocalizations) ──────────────
// Apple 3.1.2(c): o campo Privacy Policy URL precisa de link funcional.
const PRIVACY_URL = 'https://irontracks.com.br/privacy'
console.log('→ Garantindo Privacy Policy URL na metadata...')
try {
    const appInfosRes = await api('GET', `/v1/apps/${app.id}/appInfos`)
    const appInfo = (appInfosRes.data || [])[0]
    if (appInfo) {
        const ailRes = await api('GET', `/v1/appInfos/${appInfo.id}/appInfoLocalizations`)
        for (const loc of (ailRes.data || [])) {
            const cur = String(loc.attributes.privacyPolicyUrl || '')
            if (cur) { console.log(`  ${loc.attributes.locale}: já tem privacy URL — ok`); continue }
            if (dryRun) { console.log(`  [DRY-RUN] ${loc.attributes.locale}: setaria ${PRIVACY_URL}`); continue }
            await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, {
                data: { type: 'appInfoLocalizations', id: loc.id, attributes: { privacyPolicyUrl: PRIVACY_URL } },
            })
            console.log(`  ✅ ${loc.attributes.locale}: privacy URL setado`)
        }
    } else {
        console.log('  ⚠️ appInfo não encontrado — verifique manualmente')
    }
} catch (e) { console.log('  ⚠️ privacy URL falhou:', e?.message || e) }

// ─── 4d. App Review Information: conta demo + notas ─────────────────────────
// A conta demo (com assinatura expirada) é gravada NOS CAMPOS ESTRUTURADOS
// (demoAccountName/Password/Required) E nas notas. As credenciais vêm do ambiente
// (ASC_DEMO_EMAIL / ASC_DEMO_PASSWORD) pra NÃO ficarem hardcoded/commitadas.
const DEMO_EMAIL = (process.env.ASC_DEMO_EMAIL || '').trim()
const DEMO_PASSWORD = (process.env.ASC_DEMO_PASSWORD || '').trim()
const hasDemo = Boolean(DEMO_EMAIL && DEMO_PASSWORD)
const demoBlock = hasDemo
    ? `\n\nGUIDELINE 2.1 — Demo account (expired subscription):\nEmail: ${DEMO_EMAIL}\nPassword: ${DEMO_PASSWORD}\nThis account has an expired subscription so you can review the entire purchase flow.`
    : ''
const REVIEW_NOTES = `GUIDELINE 2.1(a) — Sign in with Apple:
Sign in with Apple now works for both first-time and returning users. A prior account-provisioning bug that could show an error on a repeat authorization has been fixed. The app loads its web layer from our servers, so the fix is already live for this build — no new binary is required.${demoBlock}

GUIDELINE 3.1.2(c) — Auto-renewable subscriptions:
The subscription screen shows the subscription title, length and price, with functional links to the Terms of Use (EULA) and the Privacy Policy. The Privacy Policy URL is set in App Store Connect and the Terms of Use (EULA) link is included in the app description.`

const reviewAttrs = { notes: REVIEW_NOTES }
if (hasDemo) {
    reviewAttrs.demoAccountName = DEMO_EMAIL
    reviewAttrs.demoAccountPassword = DEMO_PASSWORD
    reviewAttrs.demoAccountRequired = true
}
console.log(`→ Atualizando App Review Information (conta demo=${DEMO_EMAIL || 'none'} + notas)...`)
try {
    const ardRes = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)
    const ardId = ardRes?.data?.id
    if (dryRun) {
        console.log(`  [DRY-RUN] ${ardId ? 'PATCH' : 'POST'} review detail (notas ${REVIEW_NOTES.length} chars, demo=${DEMO_EMAIL || 'none'})`)
    } else if (ardId) {
        await api('PATCH', `/v1/appStoreReviewDetails/${ardId}`, {
            data: { type: 'appStoreReviewDetails', id: ardId, attributes: reviewAttrs },
        })
        console.log('  ✅ App Review Information atualizada (PATCH)')
    } else {
        await api('POST', `/v1/appStoreReviewDetails`, {
            data: {
                type: 'appStoreReviewDetails',
                attributes: reviewAttrs,
                relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
            },
        })
        console.log('  ✅ App Review Information criada (POST)')
    }
} catch (e) { console.log('  ⚠️ App Review Information falhou:', e?.message || e) }

// ─── 5. Attach the build ───────────────────────────────────────────────────
console.log('→ Attaching build to version...')
if (dryRun) {
    console.log('  [DRY-RUN] would attach build', build.id)
} else {
    await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, {
        data: { type: 'builds', id: build.id },
    })
    console.log('  ✅ Build attached')
}

// ─── 6. Submit for review ──────────────────────────────────────────────────
console.log('→ Submitting for App Store review...')
if (dryRun || noSubmit) {
    console.log(dryRun
        ? `  [DRY-RUN] would submit version ${version.id} for review`
        : `  [--no-submit] metadata/notas aplicados; submissão PULADA`)
    console.log(`\n✅ ${dryRun ? 'Dry-run' : 'No-submit'} completo. Rode sem a flag pra submeter de verdade.`)
    process.exit(0)
}

// Modern submission flow uses reviewSubmissions (replaces appStoreVersionSubmissions)
try {
    const subRes = await api('POST', '/v1/reviewSubmissions', {
        data: {
            type: 'reviewSubmissions',
            attributes: { platform: 'IOS' },
            relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
    })
    const submissionId = subRes.data.id
    console.log(`  Created review submission ${submissionId}`)

    await api('POST', '/v1/reviewSubmissionItems', {
        data: {
            type: 'reviewSubmissionItems',
            relationships: {
                reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
                appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
            },
        },
    })
    console.log('  Linked version to submission')

    await api('PATCH', `/v1/reviewSubmissions/${submissionId}`, {
        data: {
            type: 'reviewSubmissions',
            id: submissionId,
            attributes: { submitted: true },
        },
    })
    console.log('  ✅ Submitted for review')
} catch (e) {
    console.error('Submit error:', e?.message || e)
    process.exit(1)
}

console.log('')
console.log(`✅ Build ${build.attributes.version} submetido pra review da Apple.`)
console.log('   Apple revisa em 1–3 dias. Você recebe email do resultado.')
console.log('   Após aprovação: auto-release ativado (vai pros usuários sozinho).')
