import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildTrainingLoadFlags, buildWeeklyVolumeStats } from '../reportMetrics'

/**
 * "DIA RUIM" COMPARA O MESMO TREINO — 18/09/2026.
 *
 * `buildTrainingLoadFlags` montava a média de referência com as 6 sessões mais
 * recentes de QUALQUER treino dentro de uma janela fixa de 13 dias. Upper A,
 * Upper B, Lower A, Lower B e Pump entravam na mesma média, sendo grupos
 * musculares e volumes estruturalmente diferentes.
 *
 * O falso positivo aparecia com força logo DEPOIS de uma descarga: as sessões
 * de deload são (corretamente) excluídas da média, então sobram poucas sessões
 * na janela — e são justamente as de OUTROS treinos, anteriores ao deload. O
 * app comparava o recomeço saudável contra o volume alto que motivou a
 * descarga.
 *
 * Medido na conta do dono (`d04bfcef-…`), nos três dias seguintes à descarga de
 * 07–11/09/2026, com o `dayDropPct` gravado em produção:
 *
 *   14/09 SEG · Upper B  → −26,0 %  (comparado com Lower A, Upper A e Pump)
 *   17/09 QUI · Lower B  → −15,5 %  (comparado com Pump, Upper B e Lower A)
 *   18/09 QUA · Upper A  → −20,6 %  (comparado com Upper B, Lower A e Lower B)
 *
 * Contra a MESMA sessão do ciclo anterior, os três dias progrediram em todos os
 * exercícios (chest press +12,5 kg, leg press +100 kg, puxada +27 kg). Não
 * houve dia ruim nenhum.
 *
 * A identidade do treino é o `originWorkoutId`, não o nome: medido na mesma
 * conta, o MESMO treino aparece com 3 a 4 nomes diferentes em 120 dias
 * ("SEG · Upper B…", "SEX · Upper B…", "Treino 4 · Upper B…") porque o prefixo
 * do dia muda quando a semana é reorganizada. O id agrupou 15, 14, 13, 10 e 10
 * sessões; o nome teria fatiado cada um em três.
 */

const UPPER_A = 'f1e8ae44-eaa3-45c6-a6e8-825036cf0492'
const UPPER_B = '0140b8c4-7dbd-4b6e-97fb-722c5a4aef93'
const LOWER_A = 'f2c1afdf-299b-4f84-8878-550a02904192'
const LOWER_B = '76cbd80e-7867-4745-8a64-0286b42d9798'

type Opcoes = {
  oid?: string | null
  titulo?: string
  diasAtras: number
  volume: number
  deload?: boolean
}

const sessao = ({ oid = null, titulo = 'Treino', diasAtras, volume, deload }: Opcoes) => ({
  date: new Date(Date.UTC(2026, 8, 18) - diasAtras * 24 * 60 * 60 * 1000).toISOString(),
  workoutTitle: titulo,
  originWorkoutId: oid,
  exercises: [{ name: 'Exercício', sets: 1 }],
  logs: {
    '0-0': {
      weight: String(volume),
      reps: '1',
      done: true,
      ...(deload ? { deload: { originalWeight: volume * 1.25, suggestedWeight: volume, reductionPct: 0.2 } } : {}),
    },
  },
})

/** Os outros splits da janela de 13 dias — todos com volume MAIOR que o Upper A. */
const OUTROS_SPLITS = [
  sessao({ oid: UPPER_B, titulo: 'SEG · Upper B - Peito + Braços', diasAtras: 4, volume: 12000 }),
  sessao({ oid: LOWER_A, titulo: 'TER · Lower A - Quadríceps + Glúteo', diasAtras: 3, volume: 12500 }),
  sessao({ oid: LOWER_B, titulo: 'QUI · Lower B - Posterior + Glúteo', diasAtras: 1, volume: 11500 }),
]

const flags = (atual: ReturnType<typeof sessao>, historico: ReturnType<typeof sessao>[]) =>
  buildTrainingLoadFlags(atual, historico, buildWeeklyVolumeStats(atual, historico))

describe('isBadDay compara o MESMO treino', () => {
  it('o caso real de 18/09: Upper A pós-deload não é dia ruim só porque os outros splits pesam mais', () => {
    const upperAHoje = sessao({ oid: UPPER_A, titulo: 'QUA · Upper A - Costas + Ombro', diasAtras: 0, volume: 9500 })
    const historico = [
      ...OUTROS_SPLITS,
      // As ocorrências anteriores do PRÓPRIO Upper A — nelas ele não caiu, subiu.
      sessao({ oid: UPPER_A, titulo: 'QUA · Upper A - Costas + Ombro', diasAtras: 8, volume: 9000 }),
      sessao({ oid: UPPER_A, titulo: 'TER · Upper A - Costas + Ombro', diasAtras: 16, volume: 9200 }),
    ]
    const r = flags(upperAHoje, historico)
    expect(r.isBadDay).toBe(false)
    expect(r.dayDropPct).toBeGreaterThan(0) // 9500 contra a média 9100 do próprio treino
    expect(r.sampleSize).toBe(2)
  })

  it('a média de referência ignora sessões de OUTROS treinos', () => {
    const upperAHoje = sessao({ oid: UPPER_A, diasAtras: 0, volume: 10000 })
    const soOutros = flags(upperAHoje, [
      ...OUTROS_SPLITS,
      sessao({ oid: UPPER_A, diasAtras: 7, volume: 10000 }),
      sessao({ oid: UPPER_A, diasAtras: 14, volume: 10000 }),
    ])
    // Média do próprio treino = 10000 → está no padrão. Com os outros splits na
    // conta (12000/12500/11500) daria uma queda de ~10 %.
    expect(soOutros.dayDropPct).toBe(0)
  })

  it('queda de verdade contra o PRÓPRIO treino continua sendo dia ruim', () => {
    const upperAFraco = sessao({ oid: UPPER_A, diasAtras: 0, volume: 6000 })
    const r = flags(upperAFraco, [
      ...OUTROS_SPLITS,
      sessao({ oid: UPPER_A, diasAtras: 7, volume: 9000 }),
      sessao({ oid: UPPER_A, diasAtras: 14, volume: 9200 }),
    ])
    expect(r.isBadDay).toBe(true)
    expect(r.dayDropPct).toBeLessThan(-10)
  })

  it('amostra pequena não vira veredito: 1 sessão do mesmo treino não marca dia ruim', () => {
    // "Sem dado suficiente" é diferente de "caiu de verdade". Medido na conta do
    // dono: com a janela antiga de 13 dias, só 10 de 71 sessões tinham 2+
    // ocorrências do mesmo treino — por isso a janela também subiu para 45 dias.
    const r = flags(sessao({ oid: UPPER_A, diasAtras: 0, volume: 6000 }), [
      ...OUTROS_SPLITS,
      sessao({ oid: UPPER_A, diasAtras: 7, volume: 9000 }),
    ])
    expect(r.isBadDay).toBe(false)
    expect(r.sampleSize).toBe(1)
    expect(r.dayDropPct).toBeLessThan(-10) // o número é honesto…
    expect(r.reason).toMatch(/amostra|hist[óo]rico/i) // …e a razão diz por que não virou flag
  })

  it('nenhuma sessão do mesmo treino: não inventa comparação', () => {
    const r = flags(sessao({ oid: UPPER_A, diasAtras: 0, volume: 6000 }), OUTROS_SPLITS)
    expect(r.isBadDay).toBe(false)
    expect(r.sampleSize).toBe(0)
    expect(r.dayDropPct).toBe(0)
  })

  it('sem originWorkoutId a identidade cai no NOME normalizado', () => {
    // 9 das 155 sessões da conta do dono não têm o id (payload antigo).
    const hoje = sessao({ oid: null, titulo: 'QUA · Upper A - Costas + Ombro', diasAtras: 0, volume: 6000 })
    const r = flags(hoje, [
      ...OUTROS_SPLITS,
      sessao({ oid: null, titulo: 'qua · upper a - costas + ombro', diasAtras: 7, volume: 9000 }),
      sessao({ oid: null, titulo: 'QUA · Upper A - Costas + Ombro', diasAtras: 14, volume: 9200 }),
    ])
    expect(r.sampleSize).toBe(2)
    expect(r.isBadDay).toBe(true)
  })

  it('descarga do PRÓPRIO treino continua fora da média de referência', () => {
    const r = flags(sessao({ oid: UPPER_A, diasAtras: 0, volume: 9000 }), [
      sessao({ oid: UPPER_A, diasAtras: 7, volume: 9000 }),
      sessao({ oid: UPPER_A, diasAtras: 10, volume: 9000 }),
      sessao({ oid: UPPER_A, diasAtras: 14, volume: 4000, deload: true }),
    ])
    expect(r.sampleSize).toBe(2)
    expect(r.dayDropPct).toBe(0)
  })
})

describe('fiação: a janela do finish precisa alcançar o mesmo treino', () => {
  /**
   * O filtro por treino só funciona se a busca trouxer ocorrências do treino.
   * Medido na conta do dono, sobre 71 sessões com id: em 13 dias o mesmo treino
   * aparece 0,90 vez em média (10 sessões com 2+); em 45 dias, 3,62 (53 com
   * 2+). Sem esta metade, a correção troca o falso positivo por uma flag morta.
   */
  it('a rota busca pelo menos 45 dias de histórico', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/workouts/finish/route.ts'), 'utf8')
    const m = src.match(/setDate\(\s*baseDate\.getDate\(\)\s*-\s*(\d+)\s*\)/)
    expect(m, 'a janela de histórico do finish sumiu ou mudou de forma').toBeTruthy()
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(45)
  })
})
