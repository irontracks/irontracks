import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ReportExerciseCard } from '../ReportExerciseCard'
import { buildReportHTML } from '@/utils/report/buildHtml'
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'
import {
  EXERCISE_CHAT_SUMMARY_LABEL,
  groupExerciseChatSummariesByIndex,
  parseExerciseChatSummaries,
} from '@/lib/workout/exerciseChatSummary'

/**
 * O resumo que a IA escreve no chat de um exercício precisa chegar às DUAS
 * superfícies do relatório — a tela (`ReportExerciseCard`) e o PDF
 * (`buildHtml`). São dois geradores independentes, e a história deste repo é
 * clara: quem corrige um esquece o outro (aconteceu com a falha muscular, com o
 * check-in e com o aquecimento). Por isso os casos abaixo alimentam os dois com
 * a MESMA entrada, no mesmo teste.
 *
 * A segunda metade é igualmente importante: **ausência é o caso normal**.
 * Treino antigo não tem conversa nenhuma, e um bloco vazio (ou um "sem resumo")
 * em todos os cards faria o normal parecer falha.
 */

const RESUMO = 'Trave a escápula antes de descer a barra; a série 3 perdeu a linha do cotovelo.'

const sessao = () => ({
  workoutTitle: 'Upper A',
  date: new Date().toISOString(),
  totalTime: 1800,
  realTotalTime: 1700,
  logs: { '0-0': { weight: 60, reps: 10, done: true } },
  exercises: [{ name: 'Supino reto', sets: 1, setDetails: [{}] }],
})

const item = (over: Record<string, unknown> = {}) => ({
  exerciseIndex: 0,
  exerciseName: 'Supino reto',
  summary: RESUMO,
  createdAt: '2026-09-12T12:00:00Z',
  ...over,
})

const renderCard = (chatSummary: ReturnType<typeof item> | null) =>
  render(
    <ReportExerciseCard
      exercise={{ name: 'Supino reto', sets: 1 }}
      exIdx={0}
      sessionLogs={{ '0-0': { done: true, weight: '60', reps: '10' } }}
      prevLogs={[]}
      baseMs={null}
      chatSummary={chatSummary ? groupExerciseChatSummariesByIndex([chatSummary])[0] : null}
    />,
  )

const pdf = (itens: unknown[]) =>
  buildReportHTML(sessao(), null, 'Aluno', 100, { chatSummaries: itens })

describe('o resumo da IA chega às duas superfícies', () => {
  it('TELA: o texto do resumo aparece no card do exercício', () => {
    renderCard(item())
    expect(screen.getByText(RESUMO)).toBeTruthy()
    expect(screen.getByText(new RegExp(EXERCISE_CHAT_SUMMARY_LABEL))).toBeTruthy()
  })

  it('PDF: o MESMO texto aparece no HTML exportado', () => {
    const html = pdf([item()])
    expect(html).toContain(EXERCISE_CHAT_SUMMARY_LABEL)
    // O texto vai escapado — comparar pelo trecho sem entidades é suficiente e
    // não quebra quando a pontuação do fixture mudar.
    expect(html).toContain('Trave a escápula antes de descer a barra')
  })

  it('o PDF leva só TEXTO: nada de <img>/<video> do chat', () => {
    const html = pdf([item({ summary: 'Foto conferida: aparelho certo.' })])
    const bloco = html.slice(html.indexOf(EXERCISE_CHAT_SUMMARY_LABEL))
    expect(bloco.slice(0, 600)).not.toMatch(/<(img|video)\b/i)
  })
})

describe('ausência NÃO pode parecer falha', () => {
  it('TELA: sem resumo, nenhum bloco é desenhado', () => {
    const { container } = renderCard(null)
    expect(container.textContent || '').not.toContain(EXERCISE_CHAT_SUMMARY_LABEL)
  })

  it('PDF: sem resumo, nenhum bloco é desenhado', () => {
    expect(pdf([])).not.toContain(EXERCISE_CHAT_SUMMARY_LABEL)
    expect(buildReportHTML(sessao(), null, 'Aluno', 100, {})).not.toContain(EXERCISE_CHAT_SUMMARY_LABEL)
  })

  it('resumo em branco é descartado nas duas pontas — não vira bloco vazio', () => {
    const vazio = item({ summary: '   ' })
    const { container } = renderCard(vazio)
    expect(container.textContent || '').not.toContain(EXERCISE_CHAT_SUMMARY_LABEL)
    expect(pdf([vazio])).not.toContain(EXERCISE_CHAT_SUMMARY_LABEL)
  })
})

describe('o exercício trocado no meio do treino é DECLARADO, não escondido', () => {
  it('TELA e PDF dizem sobre qual exercício a IA falou', () => {
    const trocado = item({ exerciseName: 'Crucifixo na máquina' })
    const { container } = renderCard(trocado)
    expect(container.textContent || '').toContain('Crucifixo na máquina')
    expect(container.textContent || '').toContain(RESUMO)
    const html = pdf([trocado])
    expect(html).toContain('Crucifixo na m')
    expect(html).toContain('Trave a escápula antes de descer a barra')
  })

  it('nome igual (só acento/caixa diferente) não vira aviso de troca', () => {
    const { container } = renderCard(item({ exerciseName: 'SUPINO RETO' }))
    expect(container.textContent || '').not.toContain('sobre')
  })
})

describe('o resumo veste a cor da MÁQUINA, não o dourado da ação', () => {
  it('o rótulo usa o token de machineAccent e nenhum amarelo', () => {
    renderCard(item())
    // `getByText` devolve o elemento FOLHA que carrega o texto — o rótulo em si,
    // não o card inteiro.
    const rotulo = screen.getByText(new RegExp(EXERCISE_CHAT_SUMMARY_LABEL))
    expect(rotulo.className).toContain(MACHINE_ACCENT.text)
    expect(rotulo.className).not.toMatch(/yellow|amber/)
  })
})

describe('a normalização do que vem da rota/banco', () => {
  it('aceita snake_case (leitura direta do banco) e camelCase (rota)', () => {
    const vindoDoBanco = [{ exercise_index: 2, exercise_name: 'Remada', summary: 'ok', created_at: 'x' }]
    expect(parseExerciseChatSummaries(vindoDoBanco)[0].exerciseIndex).toBe(2)
    expect(parseExerciseChatSummaries([item({ exerciseIndex: 3 })])[0].exerciseIndex).toBe(3)
  })

  it('descarta linha sem resumo, com índice inválido ou fora de forma', () => {
    expect(parseExerciseChatSummaries([
      { exerciseIndex: 0, summary: '' },
      { exerciseIndex: -1, summary: 'x' },
      { exerciseIndex: 'abc', summary: 'x' },
      null,
      'lixo',
    ])).toHaveLength(0)
    expect(parseExerciseChatSummaries(null)).toEqual([])
  })

  it('um resumo por exercício — índice repetido não duplica o bloco', () => {
    const mapa = groupExerciseChatSummariesByIndex([item(), item({ summary: 'segundo' })])
    expect(Object.keys(mapa)).toHaveLength(1)
    expect(mapa[0].summary).toBe(RESUMO)
  })

  it('o texto é escapado no PDF (o resumo é saída de IA, não HTML confiável)', () => {
    const html = pdf([item({ summary: '<script>alert(1)</script> cuidado' })])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
