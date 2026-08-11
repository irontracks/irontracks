/**
 * Guards da varredura das abas que a auditoria não tinha aberto (11/08/2026):
 * Avaliações, Comunidade e VIP.
 *
 * Os dois defeitos travados aqui têm a mesma natureza — um controle ou um dado
 * dizendo a coisa errada sobre si mesmo:
 *
 * 1. O botão de voltar da aba Avaliações tinha `title="Fechar"` e executava
 *    `history.back()`. Rótulo e ação divergentes. Pior: sem `aria-label`, e em
 *    botão só de ícone o `title` não é lido de forma confiável por leitor de
 *    tela — quem usa VoiceOver ouvia "botão" e nada mais.
 *
 * 2. Os chips do resumo semanal VIP são a PROVENIÊNCIA do texto gerado (o que a
 *    IA leu), não métricas. Sem rótulo, o primeiro deles ("4 dias treinados
 *    (últimos 7d)") lia como repetição burra do card logo acima, que mostra o
 *    mesmo 4 em corpo 20 — a mesma armadilha que já derrubou o `summaryText`
 *    cru daquele card.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('botão de voltar das Avaliações', () => {
  const src = read('assessment/AssessmentHeader.tsx')
  const botao = /\{!onClose \? \(([\s\S]*?)\) : null\}/.exec(src)?.[1] ?? ''

  it('o guard encontrou o botão', () => {
    expect(botao).not.toBe('')
  })

  it('tem nome acessível — ícone sozinho não fala', () => {
    expect(botao).toMatch(/aria-label="Voltar"/)
  })

  it('o rótulo nomeia a ação real, não outra', () => {
    // Executa history.back(): é VOLTAR. "Fechar" prometia coisa diferente.
    expect(botao).toMatch(/history\.back\(\)/)
    expect(botao).not.toMatch(/title="Fechar"/)
  })

  it('não fica no meio da pilha de botões', () => {
    // Sem `self-start` ele centraliza na coluna de cinco botões e, por
    // proximidade, parece pertencer ao terceiro deles.
    expect(botao).toMatch(/self-start/)
  })
})

describe('proveniência do resumo semanal VIP', () => {
  const src = read('vip/VipWeeklySummaryCard.tsx')

  it('os chips têm rótulo que os separa das métricas', () => {
    const bloco = /\{dataUsed\.length \? \(([\s\S]*?)\) : null\}/.exec(src)?.[1] ?? ''
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/Baseado em/)
  })

  it('o card continua mostrando a métrica em destaque', () => {
    // O rótulo resolve a ambiguidade; não é desculpa para tirar o dado do lugar
    // onde ele é protagonista.
    expect(src).toMatch(/text-xl font-black text-white">\{trainedDays\}/)
  })
})
