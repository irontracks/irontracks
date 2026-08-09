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
  return hmacIgual(hashed, v1)
}

/**
 * Comparação em tempo constante do HMAC.
 *
 * `===` em string sai no primeiro byte diferente, então o tempo de resposta
 * vaza quantos caracteres o atacante acertou — e a assinatura pode ser
 * reconstruída byte a byte, sem nunca conhecer o segredo. O webhook do
 * RevenueCat já compara assim (`safeEqual`); este ficou para trás.
 *
 * `timingSafeEqual` EXIGE buffers do mesmo tamanho — com tamanhos diferentes
 * ele lança, e um try/catch devolvendo `false` reintroduziria o vazamento
 * (agora pelo custo da exceção). Por isso o comprimento é checado antes: ele
 * não é segredo, o hash tem tamanho fixo conhecido.
 */
function hmacIgual(esperado: string, recebido: string): boolean {
    const a = Buffer.from(esperado.toLowerCase(), 'utf8')
    const b = Buffer.from(String(recebido || '').toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
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

/**
 * ── external_reference ────────────────────────────────────────────────────────
 *
 * É o único elo entre quem cria a cobrança (as rotas de checkout) e quem
 * concede o acesso (o webhook): uma string com campos separados por `:`. Estava
 * montada à mão numa ponta e desestruturada por posição na outra — e as duas
 * pontas divergiram em silêncio no fluxo `student_plan`: o checkout escreve
 * `student_plan:professor:plano:aluno:assinatura` (5 campos) e o webhook lia a
 * assinatura da posição 3, que é o ID do ALUNO. Resultado: pagamento aprovado
 * não ativava assinatura nenhuma (`.eq('id', <id do aluno>)` não casa com nada).
 *
 * Nunca chegou a queimar ninguém — o fluxo ainda não tinha uso em produção.
 * Agora as duas pontas usam estas funções, e o teste de ida-e-volta prova que
 * elas concordam. Não monte nem leia essa string à mão.
 */
export type ExternalReference =
  | { scope: 'vip'; userId: string; planId: string }
  | { scope: 'teacher_plan'; userId: string; tierKey: string }
  | { scope: 'student_plan'; teacherUserId: string; planId: string; studentUserId: string; subscriptionId: string }
  | { scope: 'unknown'; raw: string }

export function buildVipReference(userId: string, planId: string): string {
  return `vip:${userId}:${planId}`
}

export function buildTeacherPlanReference(userId: string, tierKey: string): string {
  return `teacher_plan:${userId}:${tierKey}`
}

export function buildStudentPlanReference(input: {
  teacherUserId: string
  planId: string
  studentUserId: string
  subscriptionId: string
}): string {
  return `student_plan:${input.teacherUserId}:${input.planId}:${input.studentUserId}:${input.subscriptionId}`
}

export function parseExternalReference(raw: unknown): ExternalReference {
  const s = String(raw ?? '').trim()
  const parts = s.split(':')
  const scope = parts[0] || ''

  if (scope === 'vip' && parts[1]) {
    return { scope: 'vip', userId: parts[1], planId: parts[2] || '' }
  }
  if (scope === 'teacher_plan' && parts[1]) {
    return { scope: 'teacher_plan', userId: parts[1], tierKey: parts[2] || '' }
  }
  if (scope === 'student_plan' && parts[1]) {
    return {
      scope: 'student_plan',
      teacherUserId: parts[1],
      planId: parts[2] || '',
      studentUserId: parts[3] || '',
      subscriptionId: parts[4] || '',
    }
  }
  return { scope: 'unknown', raw: s }
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
