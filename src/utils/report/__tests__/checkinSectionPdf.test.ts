import { describe, it, expect } from 'vitest'
import { buildReportHTML } from '../buildHtml'

/**
 * Check-in/Check-out no PDF (02/09/2026) — o mesmo painel que a tela mostra
 * (`ReportCheckinPanel`), com os DOIS campos que nem a tela mostrava até este
 * dia (peso do dia e horas de sono: já coletados no check-in pré-treino, já
 * usados pelo motor de carga automática, nunca exibidos em lugar nenhum).
 *
 * Guard de comportamento — mede o HTML final, não uma função interna — porque
 * o que importa é o que chega ao PDF que sai do app.
 */

const sessaoBase = () => ({
  workoutTitle: 'Upper A',
  date: new Date().toISOString(),
  totalTime: 1800,
  realTotalTime: 1700,
  logs: { '0-0': { weight: 60, reps: 10, done: true } },
  exercises: [{ name: 'Supino reto', sets: 1, setDetails: [{}] }],
})

describe('check-in/check-out no PDF', () => {
  it('sem check-in nem check-out, a seção não existe — igual à tela', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {})
    expect(html).not.toContain('Check-in &amp; Check-out')
  })

  it('com os dois, mostra todos os campos do pré e do pós — inclusive peso e sono', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {
      preCheckin: { energy: 5, soreness: 3, weight: '82,5', sleepHours: '7,5', timeMinutes: 60, notes: 'Dor leve no ombro' },
      postCheckin: { rpe: 8, satisfaction: 4, soreness: 5, notes: 'Ombro no fim' },
      checkinRecommendations: ['RPE alto: reduza a intensidade.'],
    })
    expect(html).toContain('Check-in &amp; Check-out')
    expect(html).toContain('💪 Ótimo')
    expect(html).toContain('82,5 kg')
    expect(html).toContain('7,5 h')
    expect(html).toContain('60 min')
    expect(html).toContain('Dor leve no ombro')
    expect(html).toContain('Ombro no fim')
    expect(html).toContain('RPE alto: reduza a intensidade.')
  })

  it('só o pré (usuário pulou o check-out): a seção aparece do mesmo jeito', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {
      preCheckin: { energy: 3, weight: 80 },
    })
    expect(html).toContain('Check-in &amp; Check-out')
    expect(html).toContain('80 kg')
    expect(html).toContain('Sem check-out registrado.')
  })

  it('só o pós (check-in pulado): idem, ao contrário', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {
      postCheckin: { rpe: 9 },
    })
    expect(html).toContain('Check-in &amp; Check-out')
    expect(html).toContain('Sem check-in registrado.')
  })

  it('nota do check-in é escapada — não é o mesmo texto livre de uma exceção, mas também não confia em input do usuário', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {
      preCheckin: { notes: '<script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('peso e sono ausentes viram travessão, não "0" nem "NaN"', () => {
    const html = buildReportHTML(sessaoBase(), null, 'Aluno', 100, {
      preCheckin: { energy: 3 },
    })
    const secaoInicio = html.indexOf('Check-in &amp; Check-out')
    const secao = html.slice(secaoInicio, secaoInicio + 2500)
    expect(secao).not.toContain('NaN')
    expect(secao).not.toContain('0 kg')
    expect(secao).not.toContain('0 h')
  })
})
