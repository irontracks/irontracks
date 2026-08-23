/**
 * Guard de FIAÇÃO do botão "baixar" do Resumo da semana.
 *
 * Por que a fiação e não as pontas: `buildWeeklyMuscleReportHtml` passa verde
 * isolado com o botão morto na tela — foi assim que o "Baixar PDF" do relatório
 * de período ficou inerte no iPhone por meses (o builder existia, a chamada
 * não). Aqui o teste ANDA pela tela: carrega o resumo, toca no botão e lê o
 * HTML que de fato chegou ao exportador.
 *
 * O outro invariante travado é o caminho: `exportHtmlAsPdf` (share sheet nativo
 * no iOS). `window.print()` não existe no WKWebView.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { exportHtmlAsPdf, alertFn } = vi.hoisted(() => ({
  exportHtmlAsPdf: vi.fn().mockResolvedValue({ ok: true, via: 'native-pdf' }),
  alertFn: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/utils/report/exportHtmlAsPdf', () => ({ exportHtmlAsPdf }))
vi.mock('@/contexts/DialogContext', () => ({ useDialog: () => ({ alert: alertFn }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import WeeklyMuscleSummary from '../WeeklyMuscleSummary'

const PAYLOAD = {
  ok: true,
  found: true,
  weekStartDate: '2026-08-17',
  payload: {
    workoutsCount: 7,
    topMuscles: [
      { id: 'chest', label: 'Peitoral', sets: 28 },
      { id: 'biceps', label: 'Bíceps', sets: 15.3 },
    ],
    insights: {
      summary: ['Você realizou 7 treinos na semana iniciando em 17/08/2026.'],
      imbalanceAlerts: [
        { muscles: ['Peitoral'], evidence: 'Volume de Peitoral atingiu 28 séries.', suggestion: 'Reduza para 8 a 16 séries.' },
      ],
      recommendations: [{ title: 'Ajuste de braços', actions: ['Corte uma série de rosca direta.'] }],
    },
  },
}

const renderTela = async () => {
  render(<WeeklyMuscleSummary onBack={() => {}} />)
  await screen.findByRole('button', { name: 'Baixar resumo da semana' })
}

const clicarBaixar = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Baixar resumo da semana' }))
  await waitFor(() => expect(exportHtmlAsPdf).toHaveBeenCalled())
}

describe('Resumo da semana — baixar', () => {
  beforeEach(() => {
    exportHtmlAsPdf.mockClear().mockResolvedValue({ ok: true, via: 'native-pdf' })
    alertFn.mockClear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => PAYLOAD }))
  })

  it('o botão usa o caminho ÚNICO de export', async () => {
    await renderTela()
    await clicarBaixar()

    expect(exportHtmlAsPdf).toHaveBeenCalledOnce()
    const arg = exportHtmlAsPdf.mock.calls[0][0] as { baseFileName: string; title: string }
    expect(arg.baseFileName).toBe('IronTracks_Resumo_Semana_2026-08-17')
    expect(arg.title).toBe('Resumo da semana')
  })

  it('o arquivo leva o que está na tela: semana, músculos e a análise da IA', async () => {
    await renderTela()
    await clicarBaixar()

    const { html } = exportHtmlAsPdf.mock.calls[0][0] as { html: string }
    expect(html).toContain('17/08 – 23/08')
    expect(html).toContain('Peitoral')
    // O número que a tela mostra, na grafia pt-BR do arquivo.
    expect(html).toContain('15,3')
    expect(html).toContain('Você realizou 7 treinos')
    expect(html).toContain('Reduza para 8 a 16 séries.')
    expect(html).toContain('Corte uma série de rosca direta.')
    // A faixa recomendada vem do catálogo de músculos (chest: 8–16).
    expect(html).toContain('8 – 16')
  })

  it('falha do export APARECE — não morre num catch vazio', async () => {
    exportHtmlAsPdf.mockResolvedValueOnce({ ok: false, via: 'failed', error: 'boom' })
    await renderTela()
    await clicarBaixar()

    await waitFor(() => expect(alertFn).toHaveBeenCalled())
    expect(alertFn.mock.calls[0][0]).toBe('boom')
  })

  it('cancelar no share sheet não vira erro na cara do usuário', async () => {
    exportHtmlAsPdf.mockResolvedValueOnce({ ok: false, via: 'cancelled' })
    await renderTela()
    await clicarBaixar()

    expect(alertFn).not.toHaveBeenCalled()
  })

  it('sem dados da semana não existe botão para baixar nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true, found: false }) }))
    render(<WeeklyMuscleSummary onBack={() => {}} />)
    await screen.findByText(/Sem dados de treino/)

    expect(screen.queryByRole('button', { name: 'Baixar resumo da semana' })).toBeNull()
  })
})
