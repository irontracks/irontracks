/**
 * Regras puras do webhook do Mercado Pago — assinatura, anti-replay,
 * mapeamento de status e checagem de valor pago.
 *
 * Contexto: o mapa de cobertura (2026-07-28) apontou este webhook (537 linhas)
 * como o maior handler de dinheiro sem nenhum teste. Estas quatro regras são as
 * que decidem se um evento vira acesso pago; ficavam inline no `route.ts`, onde
 * o App Router não deixa exportar função auxiliar — e por isso nunca puderam
 * ser exercitadas.
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  parseSignature,
  verifyWebhook,
  mapSubscriptionStatus,
  addInterval,
  assessPaymentAmount,
  isRevokeStatus,
  WEBHOOK_TOLERANCE_MS,
} from '../mercadopagoWebhookRules'

const SECRET = 'mp-secret'
const DATA_ID = '1234567890'
const REQ_ID = 'req-abc'

/** Monta um x-signature válido para um dado instante. */
function sign(atMs: number, opts: { secret?: string; dataId?: string; requestId?: string } = {}) {
  const ts = Math.floor(atMs / 1000)
  const manifest = `id:${opts.dataId ?? DATA_ID};request-id:${opts.requestId ?? REQ_ID};ts:${ts};`
  const v1 = crypto.createHmac('sha256', opts.secret ?? SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

describe('parseSignature', () => {
  it('extrai ts e v1 com espaços e ordem variável', () => {
    expect(parseSignature('ts=123, v1=abc')).toEqual({ ts: '123', v1: 'abc' })
    expect(parseSignature('v1=abc,ts=123')).toEqual({ ts: '123', v1: 'abc' })
  })

  it('devolve vazio para lixo', () => {
    expect(parseSignature('')).toEqual({ ts: '', v1: '' })
    expect(parseSignature('nada-aqui')).toEqual({ ts: '', v1: '' })
  })
})

describe('verifyWebhook', () => {
  const now = 1_800_000_000_000

  it('aceita assinatura correta dentro da janela', () => {
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(now), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(true)
  })

  it('rejeita assinatura feita com outro segredo', () => {
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(now, { secret: 'outro' }), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(false)
  })

  // O manifesto amarra a assinatura ao pagamento específico. Sem isso, uma
  // assinatura capturada de um pagamento de R$1 valeria para um de R$1000.
  it('rejeita quando o dataId não é o assinado', () => {
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(now, { dataId: 'outro-pagamento' }), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(false)
  })

  it('rejeita quando o request-id não é o assinado', () => {
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(now, { requestId: 'outro-req' }), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(false)
  })

  it('rejeita replay antigo (fora da tolerância de 5 min)', () => {
    const old = now - WEBHOOK_TOLERANCE_MS - 1_000
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(old), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(false)
  })

  it('rejeita timestamp no futuro além da tolerância', () => {
    const future = now + WEBHOOK_TOLERANCE_MS + 1_000
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(future), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(false)
  })

  it('aceita na borda da tolerância', () => {
    const edge = now - WEBHOOK_TOLERANCE_MS + 1_000
    expect(verifyWebhook({
      secret: SECRET, xSignature: sign(edge), xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now,
    })).toBe(true)
  })

  it('rejeita assinatura ausente ou malformada', () => {
    for (const sig of ['', 'ts=,v1=', 'v1=abc', `ts=${Math.floor(now / 1000)}`]) {
      expect(verifyWebhook({ secret: SECRET, xSignature: sig, xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now })).toBe(false)
    }
  })

  it('aceita v1 em caixa alta (comparação case-insensitive)', () => {
    const sig = sign(now).replace(/v1=(.*)$/, (_m, h) => `v1=${String(h).toUpperCase()}`)
    expect(verifyWebhook({ secret: SECRET, xSignature: sig, xRequestId: REQ_ID, dataId: DATA_ID, nowMs: now })).toBe(true)
  })
})

describe('mapSubscriptionStatus', () => {
  it.each([
    ['authorized', 'active'],
    ['approved', 'active'],
    ['paused', 'past_due'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
    ['pending', 'pending'],
    ['status_novo_do_mp', 'pending'],
    ['', 'pending'],
  ])('%s → %s', (input, expected) => {
    expect(mapSubscriptionStatus(input)).toBe(expected)
  })

  it('ignora caixa', () => {
    expect(mapSubscriptionStatus('AUTHORIZED')).toBe('active')
  })
})

describe('isRevokeStatus', () => {
  it('cobre estorno, chargeback e cancelamento', () => {
    for (const s of ['refunded', 'cancelled', 'charged_back', 'chargedback', 'REFUNDED']) {
      expect(isRevokeStatus(s), s).toBe(true)
    }
  })

  it('não revoga por status normal', () => {
    for (const s of ['approved', 'pending', 'in_process', '']) {
      expect(isRevokeStatus(s), s).toBe(false)
    }
  })
})

describe('addInterval', () => {
  it('mensal soma 1 mês', () => {
    expect(addInterval(new Date('2026-01-15T00:00:00Z'), 'month').toISOString().slice(0, 10)).toBe('2026-02-15')
  })

  it('anual soma 12 meses', () => {
    expect(addInterval(new Date('2026-01-15T00:00:00Z'), 'year').toISOString().slice(0, 10)).toBe('2027-01-15')
  })

  it('intervalo desconhecido cai no mensal', () => {
    expect(addInterval(new Date('2026-01-15T00:00:00Z'), 'sei-la').toISOString().slice(0, 10)).toBe('2026-02-15')
  })

  it('não muta a data de entrada', () => {
    const start = new Date('2026-01-15T00:00:00Z')
    addInterval(start, 'year')
    expect(start.toISOString().slice(0, 10)).toBe('2026-01-15')
  })
})

describe('assessPaymentAmount', () => {
  it('sem preço de referência → fail-open (nunca barra receita legítima)', () => {
    for (const expected of [null, undefined, 0, NaN]) {
      const r = assessPaymentAmount(9990, expected as number | null | undefined, 'BRL', 'BRL')
      expect(r.block).toBe(false)
      expect(r.mismatch).toBe(false)
    }
  })

  it('valor exato passa limpo', () => {
    const r = assessPaymentAmount(9990, 9990, 'BRL', 'BRL')
    expect(r).toMatchObject({ block: false, mismatch: false })
  })

  it('diferença de centavos (arredondamento) não sinaliza nem bloqueia', () => {
    expect(assessPaymentAmount(9992, 9990, 'BRL', 'BRL')).toMatchObject({ block: false, mismatch: false })
  })

  it('preço mudou mas o pago é razoável → sinaliza sem bloquear', () => {
    // Ex.: plano subiu de 99,90 pra 119,90 e o usuário pagou o preço antigo.
    // Bloquear aqui seria negar acesso a quem pagou de boa-fé.
    const r = assessPaymentAmount(9990, 11990, 'BRL', 'BRL')
    expect(r.mismatch).toBe(true)
    expect(r.block).toBe(false)
  })

  it('pagou menos da metade → BLOQUEIA o acesso', () => {
    const r = assessPaymentAmount(1000, 9990, 'BRL', 'BRL')
    expect(r.block).toBe(true)
    expect(r.mismatch).toBe(true)
  })

  it('exatamente 50% passa; abaixo disso bloqueia (limite da regra)', () => {
    expect(assessPaymentAmount(5000, 10000, 'BRL', 'BRL').block).toBe(false)
    expect(assessPaymentAmount(4999, 10000, 'BRL', 'BRL').block).toBe(true)
  })

  it('moeda divergente BLOQUEIA — 100 pesos não são 100 reais', () => {
    const r = assessPaymentAmount(9990, 9990, 'ARS', 'BRL')
    expect(r.block).toBe(true)
    expect(r.mismatch).toBe(true)
  })

  it('sem moeda esperada não checa moeda', () => {
    expect(assessPaymentAmount(9990, 9990, 'ARS', null).block).toBe(false)
  })

  it('valor pago inválido é tratado como zero e bloqueia', () => {
    expect(assessPaymentAmount(NaN, 9990, 'BRL', 'BRL').block).toBe(true)
  })

  it('detalhe traz os números para o log de auditoria', () => {
    expect(assessPaymentAmount(1000, 9990, 'BRL', 'BRL').detail).toContain('paid=1000')
    expect(assessPaymentAmount(1000, 9990, 'BRL', 'BRL').detail).toContain('expected=9990')
  })
})
