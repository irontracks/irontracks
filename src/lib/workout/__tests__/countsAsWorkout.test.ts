/**
 * "Você fez 7 treinos na semana passada" — o dono tinha feito 5 (24/08/2026).
 *
 * As duas linhas a mais eram sessões reais no banco, e é por isso que a
 * contagem por LINHA parecia certa. Os casos abaixo usam os números medidos
 * naquela semana, para o critério ser conferível contra o que aconteceu.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  countsAsWorkout,
  countsAsWorkoutFromSummary,
  countDoneSets,
  parseSessionNotes,
  MIN_DONE_SETS,
  MIN_MINUTES_SINGLE_SET,
} from '../countsAsWorkout'

/** `n` séries concluídas + `extra` logs preenchidos mas NÃO concluídos. */
const sessao = (doneSets: number, minutes: number, extraNotDone = 0) => ({
  totalTime: minutes * 60,
  logs: Object.fromEntries([
    ...Array.from({ length: doneSets }, (_, i) => [`0-${i}`, { weight: '40', reps: '10', done: true }]),
    ...Array.from({ length: extraNotDone }, (_, i) => [`1-${i}`, { weight: '40', reps: '10' }]),
  ]),
})

describe('countsAsWorkout — a semana 17–23/08 do dono, linha a linha', () => {
  it('os 5 treinos reais contam', () => {
    // seg 1h44/29 séries · ter 1h03/16 · qua 1h29/28 · qui 1h07/24 · sex 1h25/27
    for (const [min, sets] of [[104, 29], [63, 16], [89, 28], [67, 24], [85, 27]]) {
      expect(countsAsWorkout(sessao(sets, min)), `${min}min/${sets} séries`).toBe(true)
    }
  })

  it('a duplicata de quarta (62 s, 1 série, 29 logs herdados) NÃO conta', () => {
    // O template trouxe 30 logs; só 1 foi concluído. Contar logs em vez de
    // `done` faria esta sessão parecer um treino cheio.
    expect(countsAsWorkout(sessao(1, 1, 29))).toBe(false)
  })

  it('a sessão de sábado 00:37 (11 min, 1 série) NÃO conta', () => {
    expect(countsAsWorkout(sessao(1, 11))).toBe(false)
  })

  it('o resultado é 5, não 7', () => {
    const semana = [sessao(29, 104), sessao(16, 63), sessao(28, 89), sessao(1, 1, 29), sessao(24, 67), sessao(27, 85), sessao(1, 11)]
    expect(semana.filter((s) => countsAsWorkout(s)).length).toBe(5)
  })
})

describe('countsAsWorkout — as bordas', () => {
  it('duas séries bastam: é o piso medido (não existe sessão real com 1 ou 2)', () => {
    expect(countsAsWorkout(sessao(MIN_DONE_SETS, 1))).toBe(true)
    expect(countsAsWorkout(sessao(MIN_DONE_SETS - 1, 1))).toBe(false)
  })

  it('cardio longo conta com UMA série — cortá-lo apagaria treino de verdade', () => {
    expect(countsAsWorkout(sessao(1, MIN_MINUTES_SINGLE_SET))).toBe(true)
    expect(countsAsWorkout(sessao(1, MIN_MINUTES_SINGLE_SET - 1))).toBe(false)
  })

  it('sessão sem nenhuma série não conta, por mais longa que seja', () => {
    // Cronômetro esquecido rodando não é treino.
    expect(countsAsWorkout(sessao(0, 240))).toBe(false)
  })

  it('lixo de entrada não vira treino', () => {
    expect(countsAsWorkout(null)).toBe(false)
    expect(countsAsWorkout('')).toBe(false)
    expect(countsAsWorkout('{quebrado')).toBe(false)
    expect(countsAsWorkout({})).toBe(false)
    expect(countsAsWorkout({ logs: {} })).toBe(false)
    expect(countsAsWorkout({ logs: { '0-0': { done: true } }, totalTime: 'abc' })).toBe(false)
  })

  it('aceita o TEXT cru de `workouts.notes` e o objeto já parseado', () => {
    const s = sessao(5, 40)
    expect(countsAsWorkout(JSON.stringify(s))).toBe(true)
    expect(countsAsWorkout(s)).toBe(true)
    expect(parseSessionNotes(JSON.stringify(s))?.totalTime).toBe(2400)
  })

  it('countDoneSets ignora log preenchido sem `done`', () => {
    expect(countDoneSets(sessao(3, 30, 10))).toBe(3)
    expect(countDoneSets(null)).toBe(0)
  })
})

/**
 * O MESMO piso, decidido a partir do resumo (linha magra do histórico).
 *
 * Esta porta existe porque a lista do próprio usuário não recebe `notes` — e
 * sem ela a tela contava LINHAS: uma sessão de 44 s aparecia como treino no
 * número que o usuário lê, enquanto o push da semana usava o piso e mostrava
 * outro. Se as duas regras divergirem, o defeito volta pela porta de trás.
 */
describe('countsAsWorkoutFromSummary', () => {
  it('2 séries concluídas já contam, qualquer que seja a duração', () => {
    expect(countsAsWorkoutFromSummary({ doneSets: 2, totalTimeSeconds: 30 })).toBe(true)
  })

  it('1 série só conta com 15 min ou mais — a porta do cardio', () => {
    expect(countsAsWorkoutFromSummary({ doneSets: 1, totalTimeSeconds: 14 * 60 })).toBe(false)
    expect(countsAsWorkoutFromSummary({ doneSets: 1, totalTimeSeconds: 15 * 60 })).toBe(true)
  })

  it('a sessão de 44 segundos que o dono viu no histórico NÃO conta', () => {
    expect(countsAsWorkoutFromSummary({ doneSets: 1, totalTimeSeconds: 44 })).toBe(false)
  })

  it('zero série nunca conta, nem com o treino durando horas', () => {
    expect(countsAsWorkoutFromSummary({ doneSets: 0, totalTimeSeconds: 3 * 3600 })).toBe(false)
  })

  it('lixo não vira treino', () => {
    expect(countsAsWorkoutFromSummary({ doneSets: null, totalTimeSeconds: null })).toBe(false)
    expect(countsAsWorkoutFromSummary({ doneSets: 'dois', totalTimeSeconds: '30' })).toBe(false)
  })

  it('concorda com `countsAsWorkout` nos mesmos casos — duas regras que divergem trazem o bug de volta', () => {
    const casos = [
      { done: 0, seconds: 600 },
      { done: 1, seconds: 44 },
      { done: 1, seconds: 20 * 60 },
      { done: 2, seconds: 60 },
      { done: 30, seconds: 3600 },
    ]
    for (const { done, seconds } of casos) {
      const logs: Record<string, unknown> = {}
      for (let i = 0; i < done; i++) logs[`0-${i}`] = { done: true }
      const pelosNotes = countsAsWorkout({ logs, totalTime: seconds })
      const peloResumo = countsAsWorkoutFromSummary({ doneSets: done, totalTimeSeconds: seconds })
      expect(peloResumo, `divergiu em done=${done} seconds=${seconds}`).toBe(pelosNotes)
    }
  })
})

describe('o resumo do histórico usa o piso (fiação)', () => {
  it('a MÉDIA usa o mesmo conjunto do contador — senão divide tudo por poucos', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/history/hooks/useHistoryData.ts'), 'utf8')
    const at = src.indexOf('const summary = useMemo(')
    const bloco = src.slice(at, at + 2500)
    // Ancora no USO, não na existência da variável: declarar
    // `segundosQueContam` e não usá-la no cálculo passaria despercebido — foi o
    // que a primeira versão deste caso deixou escapar, e a mutação pegou.
    const atribuicao = bloco.slice(bloco.indexOf('const avgMinutes'), bloco.indexOf(';', bloco.indexOf('const avgMinutes')))
    expect(atribuicao, 'a média precisa dividir o tempo DOS TREINOS QUE CONTAM')
      .toMatch(/segundosQueContam/)
    expect(atribuicao, 'a média voltou a dividir o tempo de TODAS as linhas pelos treinos válidos')
      .not.toMatch(/totalMinutes/)
  })

  it('TREINOS não conta linhas', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/history/hooks/useHistoryData.ts'), 'utf8')
    const at = src.indexOf('const summary = useMemo(')
    expect(at, 'o resumo do histórico sumiu').toBeGreaterThan(-1)
    const bloco = src.slice(at, at + 2000)
    expect(bloco).toMatch(/countsAsWorkoutFromSummary\(/)
    expect(bloco, 'voltou a contar linhas em vez de treinos').not.toMatch(/const count = visibleHistory\.length/)
  })
})
