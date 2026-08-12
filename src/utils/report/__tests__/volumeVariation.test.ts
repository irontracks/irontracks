/**
 * Guards da zona neutra da variação de volume.
 *
 * O caso real que originou (relatório aberto no aparelho, 11/08/2026): sessão
 * com 2 PRs alcançados, e ao lado um bloco VERMELHO dizendo "−209 kg / −0,8%".
 * A mesma tela, alguns blocos abaixo, chamava "−30,9%" de "semana normal".
 *
 * Dois julgamentos opostos da mesma grandeza, a poucos centímetros um do outro.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classificarVariacaoVolume,
  rotuloVariacaoVolume,
  LIMIAR_RUIDO_PCT,
} from '../volumeVariation'

describe('classificação da variação', () => {
  it('o caso real do relatório deixa de ser alarme', () => {
    expect(classificarVariacaoVolume(-0.8)).toBe('estavel')
  })

  it('queda de verdade continua sendo queda', () => {
    // Literais, não a constante: assertar contra LIMIAR seria tautológico.
    expect(classificarVariacaoVolume(-10)).toBe('queda')
    expect(classificarVariacaoVolume(-30.9)).toBe('queda')
  })

  it('ganho de verdade continua sendo ganho', () => {
    expect(classificarVariacaoVolume(12)).toBe('alta')
  })

  it('a régua é simétrica — ganho de ruído também não vira festa', () => {
    // Pintar +0,5% de verde ensina a comemorar ruído: mesma distorção, ao contrário.
    expect(classificarVariacaoVolume(0.5)).toBe('estavel')
    expect(classificarVariacaoVolume(-0.5)).toBe('estavel')
  })

  it('a borda pertence à classe de fora — 3% já é sinal', () => {
    expect(classificarVariacaoVolume(3)).toBe('alta')
    expect(classificarVariacaoVolume(-3)).toBe('queda')
    expect(classificarVariacaoVolume(2.9)).toBe('estavel')
    expect(LIMIAR_RUIDO_PCT).toBe(3)
  })

  it('valor inválido não vira alarme', () => {
    expect(classificarVariacaoVolume(NaN)).toBe('estavel')
    expect(classificarVariacaoVolume(Infinity)).toBe('estavel')
  })

  it('o rótulo neutro não usa palavra de julgamento', () => {
    const neutro = rotuloVariacaoVolume('estavel')
    expect(neutro).toMatch(/em linha/i)
    expect(neutro).not.toMatch(/queda|abaixo|perdeu|caiu/i)
  })
})

describe('fiação no card de destaques', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', '..', 'components/workout-report/ReportHighlightsPanel.tsx'),
    'utf8',
  )

  it('o card usa a classificação, não o sinal do número', () => {
    expect(src).toMatch(/classificarVariacaoVolume\(volumeDelta\)/)
    // O ternário cru sobre o sinal é exatamente o bug que existia.
    expect(src).not.toMatch(/volumeDeltaAbs > 0\s*\n?\s*\?\s*'bg-green-500\/10/)
  })

  it('existe um terceiro visual para o caso neutro', () => {
    // Sem ele, "estável" cairia em verde ou vermelho de novo.
    expect(src).toMatch(/bg-neutral-800\/60 border-neutral-700\/60/)
    expect(src).toMatch(/'text-white'/)
  })

  it('o rótulo do card vem da função, não é fixo', () => {
    expect(src).toMatch(/rotuloVariacaoVolume\(classe\)/)
    expect(src, 'rótulo fixo volta a mentir no caso neutro').not.toMatch(/>Volume vs anterior</)
  })
})
