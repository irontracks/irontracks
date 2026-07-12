import { describe, it, expect } from 'vitest'
import { isDeadFcmToken } from '../fcm'

/**
 * H1 (auditoria push) — PROPRIEDADE DE SEGURANÇA: o cleanup de token do FCM só pode remover
 * tokens que o Google confirma inexistentes. Um token VIVO nunca pode ser apagado por um erro
 * transitório (rate-limit, 5xx), de auth (401/403) ou de payload (400/INVALID_ARGUMENT).
 *
 * Como não dá pra reproduzir o UNREGISTERED do FCM sob demanda num device/emulador, esta é a
 * garantia real do H1: testamos a DECISÃO de deletar contra respostas reais do FCM v1.
 */
const fcmError = (status: string, errorCode?: string) =>
  JSON.stringify({
    error: {
      code: status === 'NOT_FOUND' ? 404 : 400,
      message: 'x',
      status,
      ...(errorCode ? { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] } : {}),
    },
  })

describe('isDeadFcmToken — REMOVE (token confirmado morto)', () => {
  it('HTTP 404 (token inexistente)', () => {
    expect(isDeadFcmToken(404, '')).toBe(true)
    expect(isDeadFcmToken(404, 'não-json')).toBe(true)
  })
  it('error.status = NOT_FOUND', () => {
    expect(isDeadFcmToken(404, fcmError('NOT_FOUND'))).toBe(true)
  })
  it('error.status = UNREGISTERED', () => {
    expect(isDeadFcmToken(400, fcmError('UNREGISTERED'))).toBe(true)
  })
  it('details[].errorCode = UNREGISTERED', () => {
    expect(isDeadFcmToken(400, fcmError('INVALID_ARGUMENT', 'UNREGISTERED'))).toBe(true)
  })
})

describe('isDeadFcmToken — NÃO REMOVE (token pode estar vivo)', () => {
  it('401/403 (auth NOSSA, não do token)', () => {
    expect(isDeadFcmToken(401, fcmError('UNAUTHENTICATED'))).toBe(false)
    expect(isDeadFcmToken(403, fcmError('PERMISSION_DENIED'))).toBe(false)
  })
  it('429 (rate limit / QUOTA_EXCEEDED)', () => {
    expect(isDeadFcmToken(429, fcmError('QUOTA_EXCEEDED'))).toBe(false)
  })
  it('500/503 (transitório do FCM)', () => {
    expect(isDeadFcmToken(500, fcmError('INTERNAL'))).toBe(false)
    expect(isDeadFcmToken(503, fcmError('UNAVAILABLE'))).toBe(false)
  })
  it('400 INVALID_ARGUMENT sem UNREGISTERED (payload ruim, token pode estar vivo)', () => {
    expect(isDeadFcmToken(400, fcmError('INVALID_ARGUMENT'))).toBe(false)
  })
  it('body não-JSON com status não-404', () => {
    expect(isDeadFcmToken(500, '<html>gateway timeout</html>')).toBe(false)
  })
  it('sucesso jamais chega aqui, mas 200 não remove', () => {
    expect(isDeadFcmToken(200, '')).toBe(false)
  })
})
