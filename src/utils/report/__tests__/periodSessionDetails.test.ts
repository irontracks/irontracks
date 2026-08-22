/**
 * Guards do detalhe série a série do relatório de período.
 *
 * O bug (22/08/2026, relatado pelo dono sobre o resumo mensal): o arquivo
 * exportado tinha só o agregado do mês — nenhum exercício, nenhum peso. Aqui
 * travamos o CONTEÚDO: cada treino do período aparece com suas séries, lidas
 * pela mesma fonte única do PDF de sessão (unilateral, drop-set, cluster).
 */
import { describe, it, expect } from 'vitest'
import { buildPeriodSessionDetail, buildPeriodSessionDetails } from '../periodSessionDetails'
import { buildPeriodReportHtml } from '../buildPeriodReportHtml'

const sessao = (over: Record<string, unknown> = {}) => ({
  date: '2026-08-20T10:00:00.000Z',
  totalTime: 3600,
  title: 'Lower A',
  exercises: [{ name: 'Leg press 45°' }, { name: 'Cadeira extensora', method: 'Drop-set' }],
  logs: {
    '0-0': { weight: '100', reps: '10', rpe: '8', done: true },
    '0-1': { weight: '110', reps: '8', done: true },
    '1-0': { weight: '40', reps: '12', done: true },
  },
  ...over,
})

describe('buildPeriodSessionDetail', () => {
  it('devolve exercícios e séries com peso, reps e RPE', () => {
    const d = buildPeriodSessionDetail(sessao())!
    expect(d.title).toBe('Lower A')
    expect(d.minutes).toBe(60)
    expect(d.exercises.map((e) => e.name)).toEqual(['Leg press 45°', 'Cadeira extensora'])

    const legPress = d.exercises[0]
    expect(legPress.sets).toHaveLength(2)
    expect(legPress.sets[0]).toMatchObject({ index: 1, weight: '100', reps: '10', rpe: '8' })
    expect(legPress.sets[1]).toMatchObject({ index: 2, weight: '110', reps: '8' })
    // 100×10 + 110×8 = 1880
    expect(legPress.volumeKg).toBe(1880)
    expect(d.volumeKg).toBe(1880 + 480)
    expect(d.setsCount).toBe(3)
  })

  it('sessão sem nenhuma série logada não vira bloco vazio no arquivo', () => {
    expect(buildPeriodSessionDetail(sessao({ logs: {} }))).toBeNull()
    expect(buildPeriodSessionDetail(sessao({ logs: { '0-0': { weight: '', reps: '' } } }))).toBeNull()
  })

  it('unilateral soma os DOIS lados (fonte única, não o topo do log)', () => {
    const d = buildPeriodSessionDetail(
      sessao({
        exercises: [{ name: 'Rosca unilateral' }],
        logs: { '0-0': { L_weight: '20', L_reps: '12', R_weight: '20', R_reps: '12', done: true } },
      })
    )!
    // volume 20×12 + 20×12 = 480; reps totais = 24 (não 12)
    expect(d.exercises[0].volumeKg).toBe(480)
    expect(d.exercises[0].totalReps).toBe(24)
    expect(d.exercises[0].sets[0].reps).toBe('24')
  })

  it('drop-set mostra as ETAPAS, não só a última carga', () => {
    const d = buildPeriodSessionDetail(
      sessao({
        exercises: [{ name: 'Cadeira extensora', method: 'Drop-set' }],
        logs: {
          '0-0': {
            weight: '36', reps: '30', done: true,
            drop_set: { stages: [{ weight: '57', reps: '12' }, { weight: '36', reps: '18' }] },
          },
        },
      })
    )!
    expect(d.exercises[0].method).toBe('Drop-set')
    expect(d.exercises[0].sets[0].weight).toBe('57 → 36')
    expect(d.exercises[0].sets[0].reps).toBe('12 → 18')
  })

  it('aquecimento aparece MARCADO e fora dos totais', () => {
    const d = buildPeriodSessionDetail(
      sessao({
        exercises: [{ name: 'Supino' }],
        logs: {
          '0-0': { weight: '40', reps: '15', set_type: 'warmup', done: true },
          '0-1': { weight: '80', reps: '10', done: true },
        },
      })
    )!
    expect(d.exercises[0].sets[0].tag).toBe('Aquec.')
    expect(d.exercises[0].sets[0].volumeKg).toBe(0)
    expect(d.exercises[0].volumeKg).toBe(800)
    expect(d.setsCount).toBe(1)
  })

  it('falha muscular (marcação manual) sobrevive ao JSON serializado', () => {
    const d = buildPeriodSessionDetail(
      sessao({ exercises: [{ name: 'Supino' }], logs: { '0-0': { weight: '80', reps: '8', failure: 'true', done: true } } })
    )!
    expect(d.exercises[0].sets[0].failure).toBe(true)
  })

  it('ordena as sessões da mais recente para a mais antiga', () => {
    const list = buildPeriodSessionDetails([
      sessao({ date: '2026-08-10T10:00:00.000Z', title: 'Antigo' }),
      sessao({ date: '2026-08-20T10:00:00.000Z', title: 'Recente' }),
    ])
    expect(list.map((s) => s.title)).toEqual(['Recente', 'Antigo'])
  })
})

describe('buildPeriodReportHtml — o arquivo carrega os treinos', () => {
  const stats = { count: 1, totalMinutes: 60, avgMinutes: 60, totalVolumeKg: 2360, avgVolumeKg: 2360 }

  it('imprime cada treino com exercício, carga e reps', () => {
    const sessions = buildPeriodSessionDetails([sessao()])
    const html = buildPeriodReportHtml({ type: 'month', stats, sessions })
    expect(html).toContain('Treinos do período (detalhado)')
    expect(html).toContain('Lower A')
    expect(html).toContain('Leg press 45°')
    expect(html).toContain('Cadeira extensora')
    // as cargas do treino têm que estar no arquivo — era o que faltava
    expect(html).toContain('>100<')
    expect(html).toContain('>110<')
  })

  it('sem detalhe, não inventa a seção', () => {
    const html = buildPeriodReportHtml({ type: 'month', stats, sessions: [] })
    expect(html).not.toContain('Treinos do período (detalhado)')
  })

  it('escapa o nome do exercício (o usuário digita esse campo)', () => {
    const sessions = buildPeriodSessionDetails([
      sessao({ exercises: [{ name: '<img src=x onerror=alert(1)>' }], logs: { '0-0': { weight: '10', reps: '10', done: true } } }),
    ])
    const html = buildPeriodReportHtml({ type: 'month', stats, sessions })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
