#!/usr/bin/env node
/**
 * scan-key-material.mjs
 *
 * Falha se material de CHAVE entrar no git.
 *
 * Por que existe: o keystore de assinatura do Android (`android/app/irontracks.jks`)
 * e o `android/key.properties` — com storePassword e keyPassword — foram commitados
 * neste repositório, que é PÚBLICO. Depois foram removidos do HEAD e cobertos pelo
 * .gitignore, mas continuam alcançáveis no histórico.
 *
 * O `scan-secrets.mjs` não pegaria isso nem hoje: ele varre apenas `src/` procurando
 * PADRÕES DE TEXTO. Um keystore é binário e mora em `android/`. Este guard olha outra
 * coisa — o que o git RASTREIA — que é exatamente o modo de falha que aconteceu.
 *
 * Uso:
 *   node scripts/scan-key-material.mjs            # tudo que está rastreado
 *   node scripts/scan-key-material.mjs --staged   # só o que está pra ser commitado
 */

import { execFileSync } from 'node:child_process'

const STAGED_ONLY = process.argv.includes('--staged')

/**
 * Cada regra é `{ re, what }`. Mantidas explícitas (e não uma regex gigante) pra que
 * a mensagem de erro diga QUAL segredo é — quem for corrigir precisa saber o que
 * rotacionar, não só que "algo vazou".
 */
const RULES = [
    { re: /(^|\/)[^/]+\.(jks|keystore)$/i, what: 'keystore de assinatura Android' },
    { re: /(^|\/)key\.properties$/i, what: 'senhas do keystore Android' },
    { re: /(^|\/)[^/]+\.p8$/i, what: 'chave da App Store Connect API' },
    { re: /(^|\/)[^/]+\.(p12|pfx)$/i, what: 'certificado com chave privada' },
    { re: /(^|\/)[^/]+\.mobileprovision$/i, what: 'provisioning profile' },
    { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i, what: 'chave SSH privada' },
    { re: /(^|\/)\.env(\.[a-z0-9_-]+)?$/i, what: 'arquivo de ambiente' },
    { re: /(^|\/)google-services\.json$/i, what: 'config do Firebase Android' },
    { re: /(^|\/)GoogleService-Info\.plist$/i, what: 'config do Firebase iOS' },
    { re: /service[-_]?account.*\.json$/i, what: 'service account de nuvem' },
]

/** Sufixos que denunciam um arquivo de EXEMPLO — esses podem entrar no git. */
const IS_TEMPLATE = /(\.example|\.sample|\.template|\.dist)($|\.)/i

const listFiles = () => {
    const args = STAGED_ONLY
        ? ['diff', '--cached', '--name-only', '--diff-filter=ACM']
        : ['ls-files']
    return execFileSync('git', args, { encoding: 'utf8' })
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
}

let files
try {
    files = listFiles()
} catch {
    console.error('✖ scan-key-material: não consegui listar arquivos do git.')
    process.exit(1)
}

const findings = []
for (const file of files) {
    if (IS_TEMPLATE.test(file)) continue
    for (const { re, what } of RULES) {
        if (re.test(file)) {
            findings.push({ file, what })
            break
        }
    }
}

const scope = STAGED_ONLY ? 'no commit' : 'rastreado pelo git'

if (findings.length === 0) {
    console.log(`✓ Nenhum material de chave ${scope}.`)
    process.exit(0)
}

console.error(`\n✖ MATERIAL DE CHAVE ${scope.toUpperCase()} — ${findings.length} arquivo(s):\n`)
for (const f of findings) {
    console.error(`   ${f.file}\n     └─ ${f.what}`)
}
console.error(`
  Segredo em repositório é comprometido no instante do push — remover depois NÃO
  desfaz. Se isto já foi enviado:
    1. ROTACIONE o segredo (é o único passo que realmente resolve).
    2. Só então limpe o histórico.
  Se ainda não foi commitado: tire do índice (git rm --cached <arquivo>) e
  adicione ao .gitignore.
`)
process.exit(1)
