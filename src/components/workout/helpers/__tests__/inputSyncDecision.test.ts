import { describe, it, expect } from 'vitest'
import { decideExternalSync } from '../inputSyncDecision'

/**
 * "Digito e some" — o campo de série perdendo valor no device.
 *
 * O instrumento anterior rotulava todo sumiço como "valor DIGITADO descartado", e
 * o payload real de 31/07/2026 mostrou que o rótulo mentia:
 *
 *   { field: "L_reps", typed: "2", sinceTypedMs: null, sinceBlurMs: null,
 *     focused: false }
 *
 * Os dois carimbos em ZERO: aquele "2" nunca foi digitado NAQUELE campo — veio do
 * log persistido. Não era corrida de digitação (onde o diagnóstico antigo mandava
 * procurar); era o dado gravado indo para vazio sozinho, com o input só refletindo.
 */

const NOW = 1_700_000_000_000
const GRACE = 2000

const base = {
  localValue: '',
  externalValue: '',
  isFocused: false,
  blurredAt: 0,
  typedAt: 0,
  now: NOW,
  graceMs: GRACE,
  alreadyRestored: false,
}

describe('decideExternalSync', () => {
  it('cursor no campo: nada sobrescreve o usuário digitando', () => {
    expect(decideExternalSync({ ...base, localValue: '10', externalValue: '', isFocused: true })).toBe('keep')
    // vale mesmo quando o externo traz OUTRO valor (autoload chegando no meio da tecla)
    expect(decideExternalSync({ ...base, localValue: '10', externalValue: '80', isFocused: true })).toBe('keep')
  })

  it('digitou há pouco: segura o valor até a gravação alcançar', () => {
    expect(decideExternalSync({ ...base, localValue: '10', typedAt: NOW - 500 })).toBe('keep')
  })

  it('saiu do campo há pouco: mesma proteção', () => {
    expect(decideExternalSync({ ...base, localValue: '10', blurredAt: NOW - 500 })).toBe('keep')
  })

  it('passada a janela de proteção, acompanha o externo', () => {
    expect(decideExternalSync({ ...base, localValue: '10', typedAt: NOW - GRACE - 1 })).toBe('accept')
  })

  it('PAYLOAD REAL: valor sem digitação e sem blur que some → restaura', () => {
    // { field: "L_reps", typed: "2", sinceTypedMs: null, sinceBlurMs: null, focused: false }
    expect(decideExternalSync({ ...base, localValue: '2', externalValue: '', isFocused: false })).toBe('restore')
  })

  it('restaura UMA vez por campo — na segunda aceita (anti-loop)', () => {
    expect(decideExternalSync({ ...base, localValue: '2', alreadyRestored: true })).toBe('accept')
  })

  it('externo com valor novo é aceito normalmente (não é sumiço)', () => {
    expect(decideExternalSync({ ...base, localValue: '10', externalValue: '12' })).toBe('accept')
  })

  it('campo que já estava vazio não dispara restauração', () => {
    expect(decideExternalSync({ ...base, localValue: '', externalValue: '' })).toBe('accept')
  })

  it('usuário APAGANDO o campo de propósito não vira restauração', () => {
    // Apagar exige estar no campo (keep) ou ter acabado de sair dele (keep dentro da
    // janela). O `restore` só alcança quem nunca tocou no campo — por construção.
    expect(decideExternalSync({ ...base, localValue: '10', externalValue: '', isFocused: true })).toBe('keep')
    expect(decideExternalSync({ ...base, localValue: '10', externalValue: '', blurredAt: NOW - 100 })).toBe('keep')
  })
})
