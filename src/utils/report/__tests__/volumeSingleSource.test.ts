import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sessionVolumeKg } from '@/utils/report/setVolume'
import { buildReportMetrics } from '@/utils/report/reportMetrics'
import { computeAiSessionMetrics } from '@/utils/report/aiSessionMetrics'
import { calculateTotalVolume } from '@/utils/report/formatters'
import { calculateTotalVolumeFromLogs } from '@/components/history/hooks/useHistoryData'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS FONTES DE VOLUME PARA A MESMA SESSÃO — NUNCA PODEM DIVERGIR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bug (jul/2026): `workouts.notes` guardava DOIS totais de volume para o mesmo
 * treino, calculados por implementações diferentes:
 *
 *   • `reportMeta.totals.volumeKg` — gravado no finish por `buildReportMetrics`,
 *     que reimplementava a soma por série dentro de `buildLogVolume`;
 *   • `ai.metrics.totalVolumeKg` — calculado com `setVolume` + `isWorkingSet`.
 *
 * Auditoria em produção (5 sessões divergentes recomputadas pelas duas contas):
 * só UMA divergia de verdade — 15/06, `9bc901d6`, 45.003 vs 27.570. A diferença
 * eram 17.433 kg exatos: 3 séries de PRANCHA de 60 s com o peso corporal do
 * usuário (96,85 × 60 × 3). O branch de isometria do `buildLogVolume` usava a
 * duração como se fosse repetição (`repsVal = durationSec`) e multiplicava pelo
 * peso — e `PlankSetInput` grava justamente `weight` = peso corporal,
 * `durationSeconds` = segundos aguentados, `reps: null`.
 *
 * Nas outras 4 as duas contas dão HOJE o mesmo número: o `ai.metrics` é um
 * retrato congelado do instante em que os insights foram gerados (inclusive por
 * versões antigas do cálculo, que zeravam unilateral — daí o 17.650 de 09/07,
 * que é o total sem os dois exercícios unilaterais da sessão). Retrato antigo
 * não é bug de cálculo; a prancha era.
 *
 * O `reportMeta.totals.volumeKg` não é decorativo: alimenta a densidade
 * (kg/min) exibida no painel do relatório, o resumo da notificação social e —
 * via `getSessionVolumeKg` — a tendência semanal e as flags de carga que a IA lê.
 *
 * Estes guards travam a CLASSE do problema, não o caso da prancha:
 *   1. toda fonte de volume total concorda, formato de série por formato de série;
 *   2. nenhuma delas volta a ter conta própria (source-guard).
 */

// ── Fixtures: um por formato de série que o app sabe gravar ──────────────────

const SESSIONS: Array<{ nome: string; session: Record<string, unknown>; esperado: number }> = [
  {
    nome: 'série normal',
    session: {
      exercises: [{ name: 'Supino Reto', sets: 2 }],
      logs: {
        '0-0': { weight: '80', reps: '10', done: true },
        '0-1': { weight: '80', reps: '8', done: true },
      },
    },
    esperado: 80 * 10 + 80 * 8,
  },
  {
    nome: 'unilateral (só L_/R_)',
    session: {
      exercises: [{ name: 'Búlgaro', sets: 1 }],
      logs: { '0-0': { L_weight: '20', L_reps: '10', R_weight: '20', R_reps: '10', done: true } },
    },
    esperado: 400,
  },
  {
    nome: 'unilateral que TAMBÉM tem weight/reps no topo (legado)',
    // O topo sobrou de quando a série era normal. Contar só o topo devolveria
    // metade do trabalho: o volume tem que somar os dois lados.
    session: {
      exercises: [{ name: 'Remada Unilateral', sets: 1 }],
      logs: {
        '0-0': { weight: '30', reps: '12', L_weight: '30', L_reps: '12', R_weight: '30', R_reps: '12', done: true },
      },
    },
    esperado: 720,
  },
  {
    nome: 'cluster (peso próprio por bloco)',
    session: {
      exercises: [{ name: 'Barra Fixa Cluster', sets: 1 }],
      logs: {
        '0-0': {
          weight: '80', reps: '15', done: true,
          cluster: { blocks: [5, 5, 5], blocksDetailed: [{ weight: '100', reps: '5' }, { weight: '90', reps: '5' }, { weight: '80', reps: '5' }] },
        },
      },
    },
    esperado: 1350,
  },
  {
    nome: 'drop-set (soma as etapas, não o topo)',
    session: {
      exercises: [{ name: 'Rosca Direta', sets: 1 }],
      logs: {
        '0-0': { weight: '20', reps: '18', done: true, drop_set: { stages: [{ weight: '30', reps: '10' }, { weight: '20', reps: '8' }] } },
      },
    },
    esperado: 460,
  },
  {
    nome: 'stripping (mesma estrutura de stages)',
    session: {
      exercises: [{ name: 'Extensora', sets: 1 }],
      logs: {
        '0-0': { weight: '60', reps: '24', done: true, stripping: { stages: [{ weight: '60', reps: '10' }, { weight: '45', reps: '8' }, { weight: '30', reps: '6' }] } },
      },
    },
    esperado: 60 * 10 + 45 * 8 + 30 * 6,
  },
  {
    nome: 'wave loading (peso próprio por tier)',
    session: {
      exercises: [{ name: 'Agachamento Onda', sets: 1 }],
      logs: {
        '0-0': {
          done: true,
          wave: { heavyWeight: '100', mediumWeight: '90', ultraWeight: '110', waves: [{ heavy: 3, medium: 5, ultra: 1 }] },
        },
      },
    },
    esperado: 100 * 3 + 90 * 5 + 110 * 1,
  },
  {
    nome: 'PRANCHA com peso corporal + duração (o bug)',
    // Formato REAL da sessão 9bc901d6 (15/06), série "5-0": PlankSetInput grava
    // weight = peso corporal, durationSeconds = segundos, reps = null. Volume de
    // CARGA de isometria é 0 — a energia gasta entra pelo modelo MET das calorias,
    // não multiplicando peso por segundo. A conta antiga somava 5.811 kg por série.
    session: {
      exercises: [{ name: 'Prancha', sets: 3 }],
      logs: {
        '0-0': { weight: 96.85, reps: null, durationSeconds: 60, done: true },
        '0-1': { weight: 96.85, reps: null, durationSeconds: 60, done: true },
        '0-2': { weight: 96.85, reps: null, durationSeconds: 60, done: true },
      },
    },
    esperado: 0,
  },
  {
    nome: 'cardio (sem peso, só duração)',
    session: {
      exercises: [{ name: 'Esteira', sets: 1 }],
      logs: { '0-0': { weight: null, reps: null, durationSeconds: 1200, speed: 8, done: true } },
    },
    esperado: 0,
  },
  {
    nome: 'aquecimento e série não concluída ficam fora',
    session: {
      exercises: [{ name: 'Supino', sets: 3 }],
      logs: {
        '0-0': { weight: '40', reps: '10', done: true, set_type: 'warmup' },
        '0-1': { weight: '80', reps: '10', done: false },
        '0-2': { weight: '80', reps: '10', done: true },
      },
    },
    esperado: 800,
  },
  {
    nome: 'peso com vírgula decimal e reps "feito/planejado"',
    session: {
      exercises: [{ name: 'Leg Press', sets: 1 }],
      logs: { '0-0': { weight: '108,6', reps: '8/10', done: true } },
    },
    esperado: 108.6 * 8,
  },
  {
    nome: 'log órfão (exercício removido) e exercício sem nome',
    // Os dois casos em que a soma POR EXERCÍCIO perdia séries que a varredura do
    // mapa de logs enxergava — a outra via de divergência, com o sinal invertido.
    session: {
      exercises: [{ name: 'Supino', sets: 1 }, { name: '', sets: 1 }],
      logs: {
        '0-0': { weight: '80', reps: '10', done: true },
        '1-0': { weight: '50', reps: '10', done: true }, // exercício sem nome
        '7-0': { weight: '40', reps: '10', done: true }, // órfão: não existe exercises[7]
      },
    },
    esperado: 800 + 500 + 400,
  },
  {
    nome: 'sessão mista (força + prancha) — o formato do caso de 09/07',
    session: {
      exercises: [{ name: 'Leg Press', sets: 2 }, { name: 'Prancha', sets: 2 }],
      logs: {
        '0-0': { weight: '200', reps: '12', done: true },
        '0-1': { weight: '200', reps: '12', done: true },
        '1-0': { weight: 73.3, reps: null, durationSeconds: 45, done: true },
        '1-1': { weight: 73.3, reps: null, durationSeconds: 45, done: true },
      },
    },
    esperado: 4800,
  },
]

const round1 = (n: number) => Math.round(n * 10) / 10

/** Logs de UM exercício (chave "exIdx-…"), pra conferir o volume linha a linha. */
const logsDoExercicio = (logs: Record<string, unknown>, exIdx: number) =>
  Object.fromEntries(Object.entries(logs).filter(([k]) => Number(k.split('-')[0]) === exIdx))

describe('volume total — todas as fontes concordam (guard de classe)', () => {
  for (const { nome, session, esperado } of SESSIONS) {
    it(nome, () => {
      const logs = session.logs as Record<string, unknown>
      const canonico = sessionVolumeKg(logs)

      // Âncora: o valor canônico é o que se obtém somando as séries à mão.
      expect(round1(canonico)).toBe(round1(esperado))

      // As duas fontes gravadas no MESMO `workouts.notes` — a divergência original.
      const metrics = buildReportMetrics(session)
      expect(metrics.totals.volumeKg).toBe(round1(canonico))
      expect(computeAiSessionMetrics(session)?.totalVolumeKg).toBe(Math.round(canonico))

      // As demais superfícies que mostram "volume total" ao usuário.
      expect(calculateTotalVolume(logs)).toBe(canonico)
      expect(calculateTotalVolumeFromLogs(logs)).toBe(canonico)

      // E o volume POR EXERCÍCIO — é ele que alimenta o gráfico por músculo, o
      // rateio de calorias e o Δ vs. a sessão anterior. Sem esta linha o guard
      // seria falso: o total já vem da fonte única e passaria mesmo com
      // `buildLogVolume` voltando a ter conta própria.
      for (const ex of metrics.exercises) {
        const idx = ex.order - 1
        expect(ex.volumeKg).toBe(round1(sessionVolumeKg(logsDoExercicio(logs, idx))))
      }
    })
  }
})

describe('reportMeta.totals.volumeKg — isometria não vira carga levantada', () => {
  it('prancha de 3×60 s com 96,85 kg soma 0 kg de volume (não 17.433)', () => {
    const session = SESSIONS.find((s) => s.nome.startsWith('PRANCHA'))!.session
    const report = buildReportMetrics(session)
    const totals = report.totals
    expect(totals.volumeKg).toBe(0)
    expect(report.exercises[0].volumeKg).toBe(0)
    // A densidade deriva do volume — o número inflado vazava direto pro painel.
    expect(totals.densityKgPerMin).toBe(0)
  })

  it('a duração aguentada continua contando como repetição/execução', () => {
    // O que muda é só o VOLUME. A prancha não some do relatório.
    const session = SESSIONS.find((s) => s.nome.startsWith('PRANCHA'))!.session
    const ex = buildReportMetrics(session).exercises[0]
    expect(ex.setsDone).toBe(3)
    expect(ex.repsDone).toBe(180) // 3 × 60 s aguentados
  })
})

/**
 * Source-guards: o guard de comportamento acima só cobre as fontes que ele
 * importa. Estes travam a REGRA — nenhuma dessas superfícies pode voltar a ter
 * sua própria soma de volume. Foi exatamente assim (cópia local que ninguém
 * sincronizou) que a divergência nasceu duas vezes.
 */
describe('source-guard — ninguém reimplementa a soma de volume', () => {
  const arquivos: Array<[string, string]> = [
    ['src/utils/report/formatters.ts', 'calculateTotalVolume'],
    ['src/components/history/hooks/useHistoryData.ts', 'calculateTotalVolumeFromLogs'],
    ['src/app/api/calories/estimate/route.ts', 'calculateTotalVolume'],
    ['src/utils/report/aiSessionMetrics.ts', 'computeAiSessionMetrics'],
    ['src/utils/report/reportMetrics.ts', 'buildReportMetrics'],
  ]

  for (const [arquivo, fonte] of arquivos) {
    it(`${arquivo} (${fonte}) delega a sessionVolumeKg`, () => {
      const src = readFileSync(arquivo, 'utf8')
      expect(src).toMatch(/sessionVolumeKg\s*\(/)
    })
  }

  it('buildLogVolume não multiplica peso por duração (o bug da prancha)', () => {
    const src = readFileSync('src/utils/report/reportMetrics.ts', 'utf8')
    const start = src.indexOf('const buildLogVolume =')
    const end = src.indexOf('export const parseCadenceSecondsPerRep')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const bloco = src.slice(start, end)
    // Qualquer `volume +=` que não seja a fonte única é reincidência.
    const somas = bloco.match(/volume\s*\+=\s*[^\n]+/g) ?? []
    expect(somas).toEqual(['volume += setVol'])
    // `repsVal` carrega os SEGUNDOS da isometria — nunca pode virar multiplicador.
    expect(bloco).not.toMatch(/\*\s*repsVal|repsVal\s*\*/)
  })

  it('a tendência por músculo usa o mesmo filtro de série de trabalho', () => {
    const src = readFileSync('src/hooks/useMuscleTrends.ts', 'utf8')
    expect(src).toMatch(/if\s*\(!isWorkingSet\(v\)\)\s*return/)
  })
})

/**
 * Quem escreve `workouts.notes` tem que deixar o `reportMeta` consistente.
 *
 * A edição de um treino no histórico (`useHistoryActions.saveEdit`) faz UPDATE
 * direto na tabela — não passa pelo `/api/workouts/finish`, que é onde o
 * `reportMeta` é calculado. Até jul/2026 ela montava a sessão do zero a partir do
 * formulário, então o treino editado perdia `reportMeta` inteiro, junto com os
 * check-ins e todo campo rico dos logs (RPE, drop-set, tempos por série).
 *
 * CONFIRMADO no banco: a sessão `55668c4c` (13/07) tem exatamente as 7 chaves que
 * o `saveEdit` gerava — `{workoutTitle, date, totalTime, realTotalTime, logs,
 * exercises, notes}` —, `reportMeta` ausente, e cada log reduzido a
 * `{done, reps, weight}`, embora o enunciado do 1º exercício descreva um
 * drop-set. O `ai` que aparece lá foi regravado depois pela rota de insights,
 * que faz `{...sessionFromNotes, ai}` e por isso não devolve o reportMeta.
 */
describe('source-guard — edição do histórico não deixa a sessão sem reportMeta', () => {
  const src = readFileSync('src/components/history/hooks/useHistoryActions.ts', 'utf8')

  it('saveEdit parte da sessão original em vez de reconstruí-la do zero', () => {
    expect(src).toMatch(/\.\.\.editBaseSession/)
  })

  it('saveEdit recalcula o reportMeta antes de gravar', () => {
    const update = src.indexOf(".from('workouts').update({ name: editTitle")
    expect(update).toBeGreaterThan(-1)
    const recalculo = src.indexOf('session.reportMeta = buildReportMetrics(session)')
    expect(recalculo).toBeGreaterThan(-1)
    expect(recalculo).toBeLessThan(update) // antes do JSON.stringify(session)
  })

  it('saveEdit re-sincroniza as métricas oficiais da IA com os logs novos', () => {
    expect(src).toMatch(/computeAiSessionMetrics\(session\)/)
  })
})
