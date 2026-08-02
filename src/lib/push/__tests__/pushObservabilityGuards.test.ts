import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da auditoria de push (observabilidade + M2). Travam:
 *  - L1: deleção de token morto NÃO engole erro em catch vazio (vai pro Sentry via logError);
 *  - L2: config APNs/FCM ausente é logError (logWarn é no-op em produção);
 *  - L4: cancelRestEndPush não engole erro;
 *  - M2: Live Activity usa env.apns.production (com trim), não process.env cru.
 */
const read = (p: string) => readFileSync(p, 'utf8')

describe('push — sem catch vazio na limpeza de token morto (L1)', () => {
  it('apns e apnsLiveActivity não têm mais .catch(() => { /* best-effort */ })', () => {
    expect(read('src/lib/push/apns.ts')).not.toMatch(/\.catch\(\(\) => \{ \/\* best-effort \*\/ \}\)/)
    expect(read('src/lib/push/apnsLiveActivity.ts')).not.toMatch(/\.catch\(\(\) => \{ \/\* best-effort \*\/ \}\)/)
    expect(read('src/lib/push/apns.ts')).toMatch(/Failed to remove stale token/)
  })
})

describe('push — config ausente vai pro Sentry (L2)', () => {
  it('apns/fcm/la usam logError no config missing', () => {
    expect(read('src/lib/push/apns.ts')).toMatch(/logError\('apns', '\[APNs\] sendPushToUsers: APNs config missing/)
    expect(read('src/lib/push/fcm.ts')).toMatch(/logError\(\s*'fcm',\s*'\[FCM\] sendFcmToUsers: config missing/)
    expect(read('src/lib/push/apnsLiveActivity.ts')).toMatch(/logError\('apns-la', '\[APNs LA\] Missing config/)
  })
})

describe('push — cancelRestEndPush não engole erro (L4)', () => {
  it('tem logError no catch do cancel', () => {
    const s = read('src/lib/push/restEndScheduler.ts')
    expect(s).not.toMatch(/\} catch \{\s*\n\s*return false/)
    expect(s).toMatch(/Falha ao cancelar push de fim de descanso/)
  })
})

describe('push — Live Activity usa env trimmed (M2)', () => {
  it('usa env.apns.production, não process.env.APNS_PRODUCTION cru', () => {
    const s = read('src/lib/push/apnsLiveActivity.ts')
    expect(s).toMatch(/const isProduction = env\.apns\.production/)
    expect(s).not.toMatch(/process\.env\.APNS_PRODUCTION === 'true'/)
  })
})
