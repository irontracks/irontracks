/**
 * Cancelar um push de fim de descanso que **já foi entregue** devolve 404 no
 * QStash. Isso não é falha: a mensagem saiu da fila e não há ação possível.
 *
 * Até 24/08/2026 virava `logError` → exception no Sentry (`rest-push:
 * {"error":"message msg_... not found"}`, com stack de 7 linhas do SDK). O
 * custo não é só ruído: o caso inofensivo ficava misturado com os que IMPORTAM
 * — rede fora, token inválido, QStash caído —, em que o push realmente dispara
 * com o usuário já de volta no app. Estes casos travam a separação.
 */
import { describe, it, expect } from 'vitest'
import { isAlreadyGoneCancel } from '../restEndScheduler'

describe('isAlreadyGoneCancel', () => {
  it('reconhece o 404 do QStash pelo status', () => {
    expect(isAlreadyGoneCancel(Object.assign(new Error('boom'), { status: 404 }))).toBe(true)
  })

  it('reconhece pela mensagem — o erro real de produção', () => {
    const real = new Error('{"error":"message msg_7YoJxFpwkEy56tfyWEXfvi9EBHg41Uqgg64jEjCBGiU4oum15GeC4 not found"}')
    expect(isAlreadyGoneCancel(real)).toBe(true)
  })

  it('NÃO engole falha de verdade — é ela que faz o push disparar indevido', () => {
    expect(isAlreadyGoneCancel(new Error('fetch failed'))).toBe(false)
    expect(isAlreadyGoneCancel(Object.assign(new Error('unauthorized'), { status: 401 }))).toBe(false)
    expect(isAlreadyGoneCancel(Object.assign(new Error('server error'), { status: 500 }))).toBe(false)
    expect(isAlreadyGoneCancel(null)).toBe(false)
  })
})
