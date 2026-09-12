/**
 * FIAÇÃO do resumo da IA no relatório de sessão — o que as duas pontas não veem.
 *
 * `resumoDaIaNoRelatorio.test.tsx` prova as PONTAS: o `ReportExerciseCard`
 * desenha o bloco quando recebe o item, e o `buildReportHTML` escreve o mesmo
 * texto quando recebe `opts.chatSummaries`. Medido por mutação em 12/09/2026:
 * apagar as DUAS linhas do `WorkoutReport` que ligam o hook às duas superfícies
 * deixa **529 testes verdes** com a feature inteira morta — nada na tela, nada
 * no PDF. É o jeito nº 3 da lista de guards falsos deste repo ("cobrindo as
 * pontas e não a fiação"), e é exatamente o que já custou o botão inerte do
 * relatório de período (`periodReportExport.test.tsx`).
 *
 * O que se trava aqui é o CAMINHO: existe UMA origem (`useExerciseChatSummaries`)
 * e ela alimenta as DUAS superfícies. Ancorado no nome do hook e no nome dos
 * props — o que FICA depois de qualquer correção —, nunca numa expressão que a
 * correção apagaria (jeito nº 6).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ARQUIVO = 'src/components/WorkoutReport.tsx'

/** Só o executável: o comentário ao lado de cada linha cita os dois nomes. */
const executavel = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const src = executavel(readFileSync(ARQUIVO, 'utf8'))

/** Nome da variável que recebe o hook — lido da fonte, nunca chumbado. */
const origem = String(/const\s+([A-Za-z0-9_$]+)\s*=\s*useExerciseChatSummaries\s*\(/.exec(src)?.[1] ?? '')

describe('o resumo da IA sai do hook e chega às DUAS superfícies', () => {
  it('autoteste: o relatório busca os resumos por um hook nomeado', () => {
    // Sem esta âncora os dois casos abaixo passariam sem olhar nada.
    expect(src, 'WorkoutReport.tsx parou de ler os resumos da IA').toContain('useExerciseChatSummaries')
    expect(origem, 'o resultado do hook precisa de um nome para ser rastreado').not.toBe('')
  })

  it('TELA: o card do exercício recebe o resumo VINDO do hook', () => {
    const bloco = src.slice(src.indexOf('<ReportExerciseCard'))
    const passado = String(/chatSummary=\{([^}]*\}?[^}]*)\}/.exec(bloco)?.[1] ?? '').trim()
    expect(passado, 'o <ReportExerciseCard> deixou de receber chatSummary').not.toBe('')
    expect(
      passado,
      `chatSummary precisa vir de ${origem}.byExercise — passar null/constante mata o bloco na tela ` +
      'sem derrubar nenhum teste de ponta',
    ).toContain(`${origem}.byExercise`)
  })

  it('PDF: o exportador recebe a MESMA lista', () => {
    expect(
      src,
      `buildReportHTML precisa receber chatSummaries de ${origem}.items — sem isso o PDF sai ` +
      'sem o resumo e a tela continua mostrando, que é a divergência entre os dois geradores',
    ).toMatch(new RegExp(`chatSummaries:\\s*${origem}\\.items`))
  })
})
