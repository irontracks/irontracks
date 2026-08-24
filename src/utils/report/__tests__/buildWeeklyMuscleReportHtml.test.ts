/**
 * O builder do arquivo do "Resumo da semana". A FIAÇÃO (o botão da tela chega
 * até aqui) é travada em `components/dashboard/__tests__/weeklySummaryExport.test.tsx`
 * — este arquivo cobre só o documento.
 */
import { describe, it, expect } from 'vitest'
import { buildWeeklyMuscleReportHtml, muscleSituation } from '../buildWeeklyMuscleReportHtml'

describe('muscleSituation', () => {
  it('classifica pela faixa recomendada', () => {
    expect(muscleSituation(5, 8, 16).label).toBe('Abaixo')
    expect(muscleSituation(12, 8, 16).label).toBe('Na meta')
    expect(muscleSituation(28, 8, 16).label).toBe('Acima')
    // Nos extremos o usuário está DENTRO — a faixa é inclusiva nos dois lados.
    expect(muscleSituation(8, 8, 16).label).toBe('Na meta')
    expect(muscleSituation(16, 8, 16).label).toBe('Na meta')
  })

  it('músculo sem meta cadastrada não recebe veredito inventado', () => {
    expect(muscleSituation(10, 0, 0).label).toBe('—')
  })
})

describe('buildWeeklyMuscleReportHtml', () => {
  const base = {
    weekStartDate: '2026-08-17',
    workoutsCount: 7,
    muscles: [
      { id: 'chest', label: 'Peitoral', sets: 28, meta: 8, metaMax: 16 },
      { id: 'biceps', label: 'Bíceps', sets: 15.3, meta: 6, metaMax: 14 },
    ],
  }

  it('a semana é lida em UTC — 17/08 nunca vira 16/08 no fuso do Brasil', () => {
    expect(buildWeeklyMuscleReportHtml(base)).toContain('17/08 – 23/08')
  })

  it('semana ausente ou malformada não imprime intervalo falso', () => {
    const html = buildWeeklyMuscleReportHtml({ ...base, weekStartDate: 'ontem' })
    expect(html).not.toContain('class="range"')
    expect(html).toContain('Resumo da semana')
  })

  it('ordena por volume e mostra séries em pt-BR com a faixa recomendada', () => {
    const html = buildWeeklyMuscleReportHtml({ ...base, muscles: [base.muscles[1], base.muscles[0]] })
    expect(html.indexOf('Peitoral')).toBeLessThan(html.indexOf('Bíceps'))
    expect(html).toContain('15,3')
    expect(html).toContain('28<') // inteiro sai sem casa decimal
    expect(html).toContain('8 – 16')
  })

  it('escapa o texto da IA — o laudo é conteúdo gerado, não confiável', () => {
    const html = buildWeeklyMuscleReportHtml({
      ...base,
      insights: { summary: ['<img src=x onerror=alert(1)>'] },
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('sem insights o arquivo sai só com os números, sem seções vazias', () => {
    const html = buildWeeklyMuscleReportHtml({ ...base, insights: null })
    expect(html).not.toContain('Análise da IA')
    expect(html).not.toContain('Pontos de atenção')
    expect(html).not.toContain('Recomendações')
    expect(html).toContain('Volume por músculo')
  })

  it('leva alertas e recomendações quando existem', () => {
    const html = buildWeeklyMuscleReportHtml({
      ...base,
      insights: {
        summary: ['Sete treinos na semana.'],
        imbalanceAlerts: [{ muscles: ['Peitoral'], evidence: '28 séries', suggestion: 'Reduza para 8 a 16.' }],
        recommendations: [{ title: 'Braços', actions: ['Corte uma série de rosca.'] }],
      },
    })
    expect(html).toContain('Sete treinos na semana.')
    expect(html).toContain('Reduza para 8 a 16.')
    expect(html).toContain('Corte uma série de rosca.')
  })

  it('só aceita baseUrl http(s) — logo não vira vetor de esquema estranho', () => {
    expect(buildWeeklyMuscleReportHtml({ ...base, baseUrl: 'javascript:alert(1)' })).not.toContain('<img class="brand-logo"')
    expect(buildWeeklyMuscleReportHtml({ ...base, baseUrl: 'https://irontracks.com.br' })).toContain(
      'https://irontracks.com.br/icone.png'
    )
  })

  it('aguenta payload vazio sem quebrar', () => {
    const html = buildWeeklyMuscleReportHtml({})
    expect(html).toContain('<!doctype html>')
    expect(html).not.toContain('Volume por músculo')
  })
})
