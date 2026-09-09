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
    // O 2º argumento é obrigatório na fiação: sem ele a classificação nunca
    // enxerga a descarga, e o card volta a pintar de vermelho a queda pedida.
    expect(src).toMatch(/classificarVariacaoVolume\(volumeDelta,\s*emDeload\)/)
    // O ternário cru sobre o sinal é exatamente o bug que existia.
    expect(src).not.toMatch(/volumeDeltaAbs > 0\s*\n?\s*\?\s*'bg-green-500\/10/)
  })

  it('a descarga é ANUNCIADA, não só despintada', () => {
    // Despintar sem dizer o motivo deixa a sessão indistinguível de uma sessão
    // fraca quando lida no histórico semanas depois — que é quando se lê.
    expect(src, 'o selo de descarga sumiu do painel').toMatch(/Descarga/)
    expect(src).toMatch(/emDeload &&/)
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

describe('sessão de DESCARGA: queda pedida não é queda', () => {
  /**
   * Print do dono, 09/09/2026: treino inteiro em deload exibindo
   * "−7.016 kg / −24,2%" em VERMELHO, ao lado de um PR alcançado. O app pintou
   * de alarme exatamente o resultado que ele mandou o app produzir.
   */
  it('−24,2% em descarga sai do vermelho', () => {
    expect(classificarVariacaoVolume(-24.2, true)).toBe('descarga')
    expect(classificarVariacaoVolume(-24.2, false)).toBe('queda')
  })

  it('o rótulo diz a CAUSA, não só o sentido', () => {
    // "abaixo da anterior" é verdade numa descarga e ainda assim engana:
    // omite que a queda foi pedida.
    expect(rotuloVariacaoVolume('descarga')).toBe('descarga planejada')
  })

  it('ALTA em descarga continua sendo alta', () => {
    // Subir volume numa semana de descarga é informação real — esconder seria
    // mentir na direção oposta.
    expect(classificarVariacaoVolume(12, true)).toBe('alta')
  })

  it('a zona neutra não muda com a descarga', () => {
    // O ruído de medição é o mesmo; a descarga só reclassifica a QUEDA.
    for (const pct of [-2.9, -0.8, 0, 1, 2.9]) {
      expect(classificarVariacaoVolume(pct, true)).toBe(classificarVariacaoVolume(pct, false))
    }
  })

  it('sem o parâmetro, o comportamento é o de sempre', () => {
    // Chamador antigo não muda de veredito por omissão.
    expect(classificarVariacaoVolume(-24.2)).toBe('queda')
  })
})
