import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isTransientStatus } from '@/components/WatchSyncProvider'
import { buildCardioIdempotencyKey, type WatchCardioSummary } from '@/hooks/useWatchBridge'

/**
 * Auditoria do Watch, 02/09/2026 — D-1, D-2, D-5, D-6.
 *
 * D-1: o check-in do relógio batia em `/api/gps/qr-checkin` (exige `qr_token`,
 * que o Watch nunca manda — WatchGym é id/lat/lng, sem QR nenhum) e o toast de
 * sucesso era incondicional (nem olhava `.catch` nem status).
 * D-6: `set.log` e o check-in ignoravam a resposta — a série sumia sem aviso.
 * D-5: 401 (sessão do iPhone expirou) perdia o dado pra sempre — o Watch já
 * apagou o cardio/série da fila DELE ao entregar aqui.
 * D-2: o mesmo cardio podia chegar por dois transportes (sendMessage + reply)
 * e duplicar no banco.
 */
const ler = (p: string) => readFileSync(p, 'utf8')

describe('isTransientStatus — separa o que reenvio resolve do que não resolve (D-5/D-6)', () => {
  it('rede (status 0)/401/408/429/5xx são TRANSITÓRIOS — reenfileirar resolve sozinho', () => {
    expect(isTransientStatus(0)).toBe(true) // fetch nem completou (erro de rede)
    expect(isTransientStatus(401)).toBe(true) // sessão do iPhone expirou
    expect(isTransientStatus(408)).toBe(true)
    expect(isTransientStatus(429)).toBe(true)
    expect(isTransientStatus(500)).toBe(true)
    expect(isTransientStatus(503)).toBe(true)
  })

  it('400/404/2xx NÃO são transitórios — reenviar payload inválido ou sessão inexistente não conserta nada', () => {
    expect(isTransientStatus(400)).toBe(false)
    expect(isTransientStatus(404)).toBe(false)
    expect(isTransientStatus(200)).toBe(false)
  })
})

describe('buildCardioIdempotencyKey — determinística pelo CONTEÚDO (D-2)', () => {
  const summary: WatchCardioSummary = {
    distanceMeters: 5000,
    durationSeconds: 1800,
    caloriesEstimated: 400,
    startedAt: '2026-09-02T10:00:00.000Z',
    finishedAt: '2026-09-02T10:30:00.000Z',
  }

  it('o MESMO resumo produz SEMPRE a mesma chave — é o que deixa a rota descartar duplicata vinda por dois transportes', () => {
    const a = buildCardioIdempotencyKey(summary)
    const b = buildCardioIdempotencyKey({ ...summary })
    expect(a).toBe(b)
    expect(a.length).toBeLessThanOrEqual(64)
    expect(a.startsWith('watch_')).toBe(true)
  })

  it('resumos DIFERENTES produzem chaves diferentes — senão duas corridas reais colidiriam', () => {
    const a = buildCardioIdempotencyKey(summary)
    const b = buildCardioIdempotencyKey({ ...summary, distanceMeters: 5001 })
    const c = buildCardioIdempotencyKey({ ...summary, finishedAt: '2026-09-02T10:31:00.000Z' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('D-1: check-in do Watch usa a rota de PROXIMIDADE, não a de QR', () => {
  const provider = ler('src/components/WatchSyncProvider.tsx')

  it('chama /api/gps/checkin — /api/gps/qr-checkin exige qr_token, que o Watch nunca manda', () => {
    expect(provider).toMatch(/fetch\('\/api\/gps\/checkin'/)
    expect(provider).not.toMatch(/fetch\('\/api\/gps\/qr-checkin'/)
  })

  it('manda o shape que /api/gps/checkin aceita (gym_id/latitude/longitude), nunca qr_token', () => {
    const i = provider.indexOf("fetch('/api/gps/checkin'")
    expect(i, 'chamada não encontrada — guard perdeu o alvo').toBeGreaterThan(-1)
    const bloco = provider.slice(i, i + 400)
    expect(bloco).toMatch(/gym_id:\s*gym\.id/)
    expect(bloco).toMatch(/latitude:\s*gym\.latitude/)
    expect(bloco).toMatch(/longitude:\s*gym\.longitude/)
    expect(bloco).not.toMatch(/qr_token/)
  })

  it('o toast de sucesso do check-in é CONDICIONAL a res.ok — antes era incondicional', () => {
    const i = provider.indexOf("fetch('/api/gps/checkin'")
    const bloco = provider.slice(i, i + 1200)
    const guardIdx = bloco.indexOf('if (res && res.ok)')
    const toastIdx = bloco.indexOf('Check-in em ${gym.name}')
    expect(guardIdx, 'precisa checar res.ok antes de comemorar').toBeGreaterThan(-1)
    expect(toastIdx, 'toast de sucesso não encontrado depois do guard').toBeGreaterThan(guardIdx)
  })
})

describe('D-6: log-set inspeciona a resposta e avisa com a causa específica', () => {
  const provider = ler('src/components/WatchSyncProvider.tsx')
  const i = provider.indexOf("fetch('/api/workouts/log-set-from-watch'")

  it('não some em silêncio — checa res.ok antes de considerar sucesso', () => {
    expect(i).toBeGreaterThan(-1)
    const bloco = provider.slice(i, i + 1800)
    expect(bloco).toMatch(/if \(res && res\.ok\) return/)
  })

  it('distingue no_active_session de exercise_not_found, com mensagem própria pra cada', () => {
    const bloco = provider.slice(i, i + 2600)
    expect(bloco).toMatch(/no_active_session/)
    expect(bloco).toMatch(/exercise_not_found/)
    expect(bloco).toMatch(/Nenhum treino ativo no iPhone/)
    expect(bloco).toMatch(/Exercício do Watch não encontrado/)
  })
})

describe('D-5: falha TRANSITÓRIA reenfileira; falha PERMANENTE só avisa', () => {
  const provider = ler('src/components/WatchSyncProvider.tsx')

  it('importa a fila de retry (offlineSync) — não pode morrer só no toast', () => {
    expect(provider).toMatch(/queueWatchCardioSave,\s*queueWatchLogSet\s*}\s*from\s*'@\/lib\/offline\/offlineSync'/)
  })

  it('log-set: reenfileira SOMENTE quando isTransientStatus(status) for true', () => {
    const i = provider.indexOf("fetch('/api/workouts/log-set-from-watch'")
    const bloco = provider.slice(i, i + 1800)
    const transientIdx = bloco.indexOf('isTransientStatus(status)')
    const queueIdx = bloco.indexOf('queueWatchLogSet(')
    expect(transientIdx).toBeGreaterThan(-1)
    expect(queueIdx, 'reenfileiramento não encontrado dentro do bloco esperado').toBeGreaterThan(transientIdx)
  })

  it('cardio: reenfileira SOMENTE quando isTransientStatus(status) for true', () => {
    const i = provider.indexOf("fetch('/api/gps/cardio/save'")
    const bloco = provider.slice(i, i + 1800)
    const transientIdx = bloco.indexOf('isTransientStatus(status)')
    const queueIdx = bloco.indexOf('queueWatchCardioSave(')
    expect(transientIdx).toBeGreaterThan(-1)
    expect(queueIdx, 'reenfileiramento não encontrado dentro do bloco esperado').toBeGreaterThan(transientIdx)
  })

  it('cada write do Watch só enfileira UMA vez — enqueue fora do guard duplicaria em qualquer falha (inclusive 400)', () => {
    expect(provider.match(/queueWatchLogSet\(/g)?.length).toBe(1)
    expect(provider.match(/queueWatchCardioSave\(/g)?.length).toBe(1)
  })
})

describe('offlineSync: a fila conhece os dois tipos de job do Watch', () => {
  const lib = ler('src/lib/offline/offlineSync.ts')

  it('o despachante do flush trata watch_cardio_save e watch_log_set — senão o job fica preso como "unknown job type"', () => {
    expect(lib).toMatch(/jobType === 'watch_cardio_save'/)
    expect(lib).toMatch(/jobType === 'watch_log_set'/)
  })

  it('exporta as duas funções de enqueue', () => {
    expect(lib).toMatch(/export const queueWatchCardioSave/)
    expect(lib).toMatch(/export const queueWatchLogSet/)
  })
})

describe('D-2 (servidor): /api/gps/cardio/save honra o client_id', () => {
  const rota = ler('src/app/api/gps/cardio/save/route.ts')

  it('o schema aceita client_id opcional', () => {
    expect(rota).toMatch(/client_id:\s*z\.string\(\)/)
  })

  it('unique_violation (23505) vira sucesso IDEMPOTENTE, não erro — é o reenvio do mesmo cardio', () => {
    expect(rota).toMatch(/code === '23505'/)
    expect(rota).toMatch(/idempotent:\s*true/)
  })

  it('coluna ausente (migration pendente) degrada SEM travar o save, mas loga alto', () => {
    expect(rota).toMatch(/does not exist/)
    expect(rota).toMatch(/tryInsert\(false\)/)
    expect(rota).toMatch(/logError\(/)
  })
})
