/**
 * A janela de cada card de destaque precisa SOMAR o número do card. Se a soma
 * do detalhe divergir, a tela explica um número com outro — pior que não
 * explicar. Estes casos travam a soma contra as fontes únicas do card
 * (`sessionVolumeKg`, a conta de séries do relatório).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessionVolumeKg } from '@/utils/report/setVolume'
import {
  volumePorExercicio, comparacaoDeVolume, seriesPorExercicio, totaisDeSeries,
} from '@/utils/report/highlightDetails'

const exercisesHoje = [
  { name: 'Leg press horizontal', sets: 3 },
  { name: 'Agachamento búlgaro', sets: 2 },
  { name: 'Leg Press Horizontal', sets: 1 }, // mesmo exercício, grafia diferente
]
const logsHoje: Record<string, unknown> = {
  '0-0': { weight: '100', reps: '10', done: true },
  '0-1': { weight: '110', reps: '8', done: true },
  '0-2': { weight: '60', reps: '12', done: true, set_type: 'warmup' }, // aquecimento: fora do volume
  '1-0': { weight: '20', reps: '10', done: true },
  '1-1': { weight: '22,5', reps: '10' }, // sem done mas com números (legado) → conta
  '2-0': { weight: '120', reps: '6', done: true },
  '9-0': { weight: '10', reps: '10', done: true }, // log órfão: exercício não existe mais
}

describe('volumePorExercicio', () => {
  it('a soma bate com o volume total do card, inclusive log órfão', () => {
    const linhas = volumePorExercicio(exercisesHoje, logsHoje)
    const soma = linhas.reduce((a, l) => a + l.volumeKg, 0)
    expect(soma).toBeCloseTo(sessionVolumeKg(logsHoje), 6)
    expect(linhas.some((l) => l.nome === 'Outras séries')).toBe(true)
  })

  it('o mesmo exercício repetido vira UMA linha', () => {
    const linhas = volumePorExercicio(exercisesHoje, logsHoje)
    const leg = linhas.filter((l) => /leg press/i.test(l.nome))
    expect(leg).toHaveLength(1)
    // 100×10 + 110×8 + 120×6 = 2600 (aquecimento fora)
    expect(leg[0].volumeKg).toBe(2600)
    expect(leg[0].series).toBe(3)
  })

  it('ordena do maior volume para o menor', () => {
    const v = volumePorExercicio(exercisesHoje, logsHoje).map((l) => l.volumeKg)
    expect(v).toEqual([...v].sort((a, b) => b - a))
  })
})

describe('comparacaoDeVolume', () => {
  const exercisesAntes = [
    { name: 'Leg press horizontal', sets: 2 },
    { name: 'Stiff', sets: 1 },
  ]
  const logsAntes = {
    '0-0': { weight: '100', reps: '12', done: true },
    '0-1': { weight: '100', reps: '12', done: true },
    '1-0': { weight: '50', reps: '10', done: true },
  }

  it('a soma das diferenças é exatamente hoje − anterior (a conta do card)', () => {
    const linhas = comparacaoDeVolume(
      { exercises: exercisesHoje, logs: logsHoje },
      { exercises: exercisesAntes, logs: logsAntes },
    )
    const soma = linhas.reduce((a, l) => a + l.deltaKg, 0)
    expect(soma).toBeCloseTo(sessionVolumeKg(logsHoje) - sessionVolumeKg(logsAntes), 6)
  })

  it('exercício que só existe de um lado aparece com zero do outro', () => {
    const linhas = comparacaoDeVolume(
      { exercises: exercisesHoje, logs: logsHoje },
      { exercises: exercisesAntes, logs: logsAntes },
    )
    const stiff = linhas.find((l) => l.nome === 'Stiff')
    expect(stiff).toMatchObject({ atualKg: 0, anteriorKg: 500, deltaKg: -500 })
    const bulgaro = linhas.find((l) => l.nome === 'Agachamento búlgaro')
    expect(bulgaro?.anteriorKg).toBe(0)
  })

  it('casa o exercício pelo nome, não pela posição no treino', () => {
    const linhas = comparacaoDeVolume(
      { exercises: exercisesHoje, logs: logsHoje },
      { exercises: exercisesAntes, logs: logsAntes },
    )
    const leg = linhas.find((l) => /leg press/i.test(l.nome))
    expect(leg).toMatchObject({ atualKg: 2600, anteriorKg: 2400, deltaKg: 200 })
  })
})

describe('seriesPorExercicio', () => {
  it('conta feitas e planejadas por exercício, e o total é o do card', () => {
    const lista = seriesPorExercicio(exercisesHoje, logsHoje)
    expect(lista.map((e) => [e.feitas, e.planejadas])).toEqual([[3, 3], [2, 2], [1, 1]])
    expect(totaisDeSeries(lista)).toEqual({ setsCompleted: 6, setsPlanned: 6, setCompletionPct: 100 })
  })

  it('série sem registro sai como não feita, e o aquecimento vem marcado', () => {
    const lista = seriesPorExercicio([{ name: 'Supino', sets: 3 }], {
      '0-0': { weight: '40', reps: '10', done: true, set_type: 'warmup' },
      '0-1': { weight: '80', reps: '8', done: true },
    })
    expect(lista[0].series).toEqual([
      { numero: 1, feita: true, peso: 40, reps: 10, marca: 'Aquec.' },
      { numero: 2, feita: true, peso: 80, reps: 8, marca: null },
      { numero: 3, feita: false, peso: 0, reps: 0, marca: null },
    ])
    expect(totaisDeSeries(lista).setCompletionPct).toBe(67)
  })

  it('o prefill do motor de carga NÃO é série feita', () => {
    const lista = seriesPorExercicio([{ name: 'Supino', sets: 1 }], {
      '0-0': { weight: '80', weightSource: 'auto' },
    })
    expect(lista[0].feitas).toBe(0)
  })
})

describe('fiação: o card e a janela saem da mesma conta', () => {
  it('o hook do relatório deriva o total de séries da lista detalhada', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/useReportData.ts'), 'utf8')
    expect(src).toMatch(/totaisDeSeries\(seriesDetalhe\)/)
    expect(src).toMatch(/seriesPorExercicio\(safeSession\?\.exercises, sessionLogs\)/)
  })
})
