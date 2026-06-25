#!/usr/bin/env node
/**
 * Smoke test: provider do RevenueCat em app_subscriptions.
 *
 * O CHECK constraint de `app_subscriptions.provider` só aceita um conjunto fixo
 * (asaas/stripe/apple/google/manual/admin/mercadopago) — NÃO aceita 'revenuecat'.
 * Como RevenueCat é intermediário do Apple IAP, a LINHA deve ser gravada com
 * provider='apple' (e o rótulo 'revenuecat' fica só em metadata.provider).
 *
 * Bug que isto previne: o sync gravava `provider: 'revenuecat'` no INSERT, então
 * o primeiro restore/sync de um usuário SEM assinatura prévia (caminho de INSERT)
 * era rejeitado pelo constraint. Estático — não toca produção.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ALLOWED = new Set(['asaas', 'stripe', 'apple', 'google', 'manual', 'admin', 'mercadopago'])

const FILES = [
  'src/app/api/billing/revenuecat/sync/route.ts',
  'src/app/api/billing/webhooks/revenuecat/route.ts',
]

const failures: string[] = []

for (const rel of FILES) {
  let src: string
  try {
    src = readFileSync(resolve(process.cwd(), rel), 'utf8')
  } catch {
    failures.push(`${rel}: arquivo não encontrado (rota movida/renomeada?)`)
    continue
  }

  // Captura cada `.from('app_subscriptions').insert({ ... })` (insert logo após o from).
  const re = /\.from\(\s*['"]app_subscriptions['"]\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g
  let m: RegExpExecArray | null
  let inserts = 0
  while ((m = re.exec(src)) !== null) {
    inserts++
    const body = m[1]
    // metadata é passado por referência (`metadata: meta`), então o único
    // `provider:` inline no corpo do insert é a COLUNA.
    const pm = body.match(/\bprovider\s*:\s*['"]([a-z_]+)['"]/)
    if (!pm) {
      failures.push(`${rel}: INSERT em app_subscriptions sem coluna provider explícita`)
      continue
    }
    const prov = pm[1]
    if (prov === 'revenuecat') {
      failures.push(`${rel}: app_subscriptions.insert usa provider:'revenuecat' — rejeitado pelo CHECK constraint (use 'apple')`)
    } else if (!ALLOWED.has(prov)) {
      failures.push(`${rel}: app_subscriptions.insert usa provider:'${prov}' fora do CHECK constraint (${[...ALLOWED].join('/')})`)
    }
  }
  if (inserts === 0) {
    failures.push(`${rel}: nenhum INSERT em app_subscriptions encontrado — verifique se a estrutura da rota mudou`)
  }
}

if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`[FAIL] ${f}\n`)
  process.exit(1)
}

process.stdout.write('ok\n')
