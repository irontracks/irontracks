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

/**
 * O fatiador mirava em `{!onClose ? (…) : null}` — a expressão do PRÓPRIO bug
 * corrigido em 27/08/2026 (`onClose` era recebido e nunca chamado; fornecê-lo
 * apagava o botão). Ao consertar, o alvo sumiu e o guard ficaria cego; o caso
 * `o guard encontrou o botão` é o que impediu isso e apontou o reparo.
 * Agora ele fatia pelo `aria-label`, que é o que o botão É — não pela condição
 * que por acaso o envolvia.
 */
const fatiarBotao = (src: string, rotulo: string) => {
  const alvo = src.indexOf(`aria-label="${rotulo}"`)
  if (alvo === -1) return ''
  const abre = src.lastIndexOf('<button', alvo)
  const fecha = src.indexOf('</button>', alvo)
  if (abre === -1 || fecha === -1) return ''
  return src.slice(abre, fecha + '</button>'.length)
}

describe('botão de voltar das Avaliações', () => {
  const src = read('assessment/AssessmentHeader.tsx')
  const botao = fatiarBotao(src, 'Voltar')

  it('o guard encontrou o botão', () => {
    expect(botao).not.toBe('')
  })

  it('tem nome acessível — ícone sozinho não fala', () => {
    expect(botao).toMatch(/aria-label="Voltar"/)
  })

  it('o rótulo nomeia a ação real, não outra', () => {
    // Volta: chama o `onClose` do pai quando existe, e cai no histórico do
    // navegador quando não existe. "Fechar" prometia coisa diferente.
    expect(botao).toMatch(/history\.back\(\)/)
    expect(botao).toMatch(/onClose\(\)/)
    expect(botao).not.toMatch(/title="Fechar"/)
  })

  it('o ícone concorda com o rótulo', () => {
    // X é o desenho de fechar/descartar. Num botão que diz "Voltar", quem
    // enxerga lê uma coisa e quem usa VoiceOver ouve outra.
    expect(botao).toMatch(/<ArrowLeft\b/)
    expect(botao).not.toMatch(/<X\b/)
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

/**
 * Um accent só — decidido em 11/08/2026 com base em evidência, não em gosto.
 *
 * As Avaliações usavam AZUL (Bioimpedância) e ROXO (Por Foto, Laudos) como se
 * fossem categoria, e a VIP usava VERDE no ícone de Nutrição. O teste que
 * decidiu: **a regra que essas cores sugeriam já era contradita pelo app**.
 * Se roxo fosse "feature de IA", então "Novo Treino — monte com inteligência
 * artificial" e "Treino Express — IA gera em segundos" seriam roxos. São
 * dourados. E o verde da Nutrição não era condicional a `macrosEnabled`, ou
 * seja, não comunicava "liberado" — era a única cor divergente entre quatro
 * irmãos.
 *
 * Cor que só significa algo numa tela não é sistema, é ruído. A diferenciação
 * ficou onde funciona (ícone e rótulo) e a hierarquia onde pertence (só a ação
 * primária é dourada).
 */
describe('um accent só', () => {
  it('as Avaliações não usam azul nem roxo como categoria', () => {
    const src = readFileSync(join(SRC, 'assessment/AssessmentHeader.tsx'), 'utf8')
    expect(src, 'azul é status/informação no sistema').not.toMatch(/rgba\(59,130,246/)
    expect(src, 'roxo não existe na paleta do app').not.toMatch(/rgba\(168,85,247/)
  })

  it('a ação primária continua sendo a única dourada', () => {
    const src = readFileSync(join(SRC, 'assessment/AssessmentHeader.tsx'), 'utf8')
    expect(src).toMatch(/btn-gold-animated/)
    expect(src).toMatch(/\+ Nova Avaliação/)
  })

  it('os quatro atalhos da VIP usam a mesma família de acento', () => {
    const src = readFileSync(join(SRC, 'VipHub.tsx'), 'utf8')
    const grade = /grid grid-cols-2 md:grid-cols-4[\s\S]{0,900}?\]\.map/.exec(src)?.[0] ?? ''
    expect(grade).not.toBe('')
    // verde é STATUS neste app; num ícone decorativo entre irmãos âmbar, destoa.
    expect(grade).not.toMatch(/text-green-\d+/)
  })
})
