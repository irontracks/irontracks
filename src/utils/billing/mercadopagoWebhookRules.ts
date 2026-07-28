/**
 * Regras puras do webhook do Mercado Pago.
 *
 * Moradia separada por um motivo prático: `route.ts` do App Router só aceita
 * exportar os métodos HTTP e as configs de rota — exportar uma função auxiliar
 * de lá quebra o build. Enquanto isso estava inline, a verificação de
 * assinatura, a tolerância de replay e a checagem de valor pago (as três coisas
 * que decidem se alguém ganha acesso pago) não tinham como ser testadas
 * diretamente. Agora têm.
 *
 * Nenhuma regra mudou nesta extração — é o mesmo código, noutro arquivo.
 */
import crypto from 'crypto'

/** Janela de replay aceita para a assinatura do MP. */
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000

export function parseSignature(raw: string): { ts: string; v1: string } {
  const parts = String(raw || '').split(',').map((p) => p.trim()).filter(Boolean)
  let ts = ''
  let v1 = ''
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => (s || '').trim())
    if (k === 'ts') ts = v || ''
    if (k === 'v1') v1 = v || ''
  }
  return { ts, v1 }
}

/**
 * HMAC-SHA256 sobre o manifesto `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`,
 * mais rejeição de timestamp fora da janela de tolerância (anti-replay).
 */
export function verifyWebhook(opts: {
  secret: string
  xSignature: string
  xRequestId: string
  dataId: string
  nowMs?: number
}): boolean {
  const { ts, v1 } = parseSignature(opts.xSignature)
  if (!ts || !v1) return false

  const tsMs = Number(ts) * 1000
  const now = opts.nowMs ?? Date.now()
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > WEBHOOK_TOLERANCE_MS) return false

  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`
  const hashed = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return hashed.toLowerCase() === v1.toLowerCase()
}

export function mapSubscriptionStatus(status: string): 'active' | 'past_due' | 'cancelled' | 'pending' {
  const s = (status || '').toLowerCase()
  if (['authorized', 'approved'].includes(s)) return 'active'
  if (['paused'].includes(s)) return 'past_due'
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled'
  return 'pending'
}

export function addInterval(start: Date, interval: string): Date {
  const d = new Date(start)
  if (String(interval || '').toLowerCase() === 'year') {
    d.setMonth(d.getMonth() + 12)
    return d
  }
  d.setMonth(d.getMonth() + 1)
  return d
}

/** Status do MP que revogam acesso já concedido. */
export const REVOKE_STATUSES = ['refunded', 'cancelled', 'charged_back', 'chargedback']

export function isRevokeStatus(status: string): boolean {
  return REVOKE_STATUSES.includes(String(status || '').toLowerCase())
}

/**
 * Defense-in-depth (auditoria 2026-06-28): confere o valor pago vs o preço do plano
 * antes de conceder acesso. NÃO é externamente explorável (valor é fixado no checkout
 * server-side + webhook tem HMAC + dados vêm da API do MP), mas protege contra bug de
 * checkout ou fluxo futuro. Política CONSERVADORA pra nunca barrar receita legítima:
 *   - sem preço de referência no banco  -> não bloqueia (fail-open);
 *   - mismatch leve (preço mudou, arredondamento) -> só sinaliza (alerta), concede;
 *   - mismatch GRAVE (pago < 50% do esperado, ou moeda divergente) -> bloqueia o grant.
 * Como não há cupom/desconto e o valor é server-fixed, < 50% só pode ser bug/fraude.
 */
export function assessPaymentAmount(
  paidCents: number,
  expectedCents: number | null | undefined,
  paidCurrency: string,
  expectedCurrency: string | null | undefined,
): { block: boolean; mismatch: boolean; detail: string } {
  const expected = Number(expectedCents || 0)
  if (!Number.isFinite(expected) || expected <= 0) {
    return { block: false, mismatch: false, detail: 'no_reference_price' }
  }
  const paid = Number.isFinite(paidCents) ? paidCents : 0
  const curExpected = String(expectedCurrency || '').trim().toUpperCase()
  const currencyOk = !curExpected || String(paidCurrency || '').toUpperCase() === curExpected
  const ratio = expected > 0 ? paid / expected : 1
  const block = !currencyOk || ratio < 0.5
  const mismatch = !currencyOk || Math.abs(paid - expected) > 2
  const detail = `paid=${paid} expected=${expected} paidCur=${paidCurrency} expCur=${curExpected || 'n/a'} ratio=${ratio.toFixed(3)}`
  return { block, mismatch, detail }
}
