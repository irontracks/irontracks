/**
 * Guard de FIAÇÃO do relatório de período (semanal/mensal).
 *
 * Os dois defeitos que este arquivo trava, relatados pelo dono em 22/08/2026
 * sobre o resumo mensal no iPhone:
 *
 *  1. **"Baixar PDF não funciona"** — o hook reimplementava a sequência antiga
 *     (`window.open(blobUrl)` + `printWindow.print()`), que não existe no
 *     WKWebView, e um `catch {}` vazio engolia a falha. O caminho único
 *     (`exportHtmlAsPdf`) já existia desde jul/2026 para as outras três telas;
 *     esta ficou de fora porque o guard daquele PR listava só os chamadores
 *     conhecidos.
 *  2. **"o arquivo é só um resumo"** — o HTML saía com os agregados do mês e
 *     nenhuma série. O detalhe agora é montado no `buildPeriodStats` e
 *     precisa CHEGAR ao HTML.
 *
 * Por que a fiação e não as pontas: `buildPeriodSessionDetails` e
 * `buildPeriodReportHtml` passam verdes isoladamente com o botão morto — foi
 * exatamente assim que `knownWeights` sumiu de uma chamada com 198 testes
 * verdes. Aqui o teste ANDA pelo hook: abre o relatório, aciona o download e
 * lê o HTML que de fato foi entregue ao exportador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// `vi.hoisted`: o `vi.mock` sobe para o topo do arquivo e um `const` comum
// ainda não existiria quando a fábrica roda.
const { exportHtmlAsPdf } = vi.hoisted(() => ({
  exportHtmlAsPdf: vi.fn().mockResolvedValue({ ok: true, via: 'native-pdf' }),
}))

vi.mock('@/utils/report/exportHtmlAsPdf', () => ({ exportHtmlAsPdf }))
vi.mock('@/actions/workout-actions', () => ({
  generatePeriodReportInsights: vi.fn().mockResolvedValue({ ok: true, ai: { summary: ['ok'] } }),
}))
// `useHistoryData` arrasta o client do Supabase; só estas duas puras interessam.
vi.mock('../useHistoryData', async () => {
  const { sessionVolumeKg } = await import('@/utils/report/setVolume')
  return {
    toDateMs: (v: unknown) => {
      const t = new Date(v as string).getTime()
      return Number.isFinite(t) ? t : null
    },
    calculateTotalVolumeFromLogs: (logs: unknown) => sessionVolumeKg(logs),
  }
})

import { useHistoryPeriodReport } from '../useHistoryPeriodReport'

const hoje = new Date().toISOString()

const historyItems = [
  {
    id: 's1',
    date: hoje,
    dateMs: Date.now(),
    totalTime: 3600,
    rawSession: {
      workoutTitle: 'Lower A',
      date: hoje,
      totalTime: 3600,
      exercises: [{ name: 'Leg press 45°' }],
      logs: { '0-0': { weight: '180', reps: '10', done: true } },
    },
  },
] as unknown as Parameters<typeof useHistoryPeriodReport>[0]['historyItems']

const setup = () =>
  renderHook(() =>
    useHistoryPeriodReport({
      historyItems,
      user: { displayName: 'DJ MK' },
      alert: vi.fn().mockResolvedValue(undefined),
    })
  )

describe('relatório de período — export', () => {
  beforeEach(() => exportHtmlAsPdf.mockClear())

  it('baixar usa o caminho ÚNICO de export (nunca window.open + print)', async () => {
    const { result } = setup()
    await act(async () => { await result.current.openPeriodReport('month') })
    await waitFor(() => expect(result.current.periodReport).not.toBeNull())

    await act(async () => { await result.current.downloadPeriodPdf() })

    expect(exportHtmlAsPdf).toHaveBeenCalledOnce()
    const arg = exportHtmlAsPdf.mock.calls[0][0] as { html: string; baseFileName: string }
    expect(arg.baseFileName).toMatch(/^IronTracks_Relatorio_Mensal_\d{4}-\d{2}-\d{2}$/)
  })

  it('o arquivo entregue contém os TREINOS, não só o agregado do mês', async () => {
    const { result } = setup()
    await act(async () => { await result.current.openPeriodReport('month') })
    await waitFor(() => expect(result.current.periodReport).not.toBeNull())
    await act(async () => { await result.current.downloadPeriodPdf() })

    const { html } = exportHtmlAsPdf.mock.calls[0][0] as { html: string }
    expect(html).toContain('Treinos do período (detalhado)')
    expect(html).toContain('Lower A')
    expect(html).toContain('Leg press 45°')
    // a carga levantada é o dado que o dono foi procurar e não achou
    expect(html).toContain('>180<')
  })

  it('falha do export vira erro NA TELA — o catch vazio antigo não deixava rastro', async () => {
    exportHtmlAsPdf.mockResolvedValueOnce({ ok: false, via: 'failed', error: 'boom' })
    const { result } = setup()
    await act(async () => { await result.current.openPeriodReport('month') })
    await waitFor(() => expect(result.current.periodReport).not.toBeNull())
    await act(async () => { await result.current.downloadPeriodPdf() })

    expect(result.current.periodPdf.status).toBe('error')
    expect(result.current.periodPdf.error).toBe('boom')
  })

  it('cancelar no share sheet não é erro', async () => {
    exportHtmlAsPdf.mockResolvedValueOnce({ ok: false, via: 'cancelled' })
    const { result } = setup()
    await act(async () => { await result.current.openPeriodReport('month') })
    await waitFor(() => expect(result.current.periodReport).not.toBeNull())
    await act(async () => { await result.current.downloadPeriodPdf() })

    expect(result.current.periodPdf.status).toBe('idle')
    expect(result.current.periodPdf.error).toBe('')
  })

  it('o detalhe do mês NÃO vai para o prompt da IA (payload e custo)', async () => {
    const { generatePeriodReportInsights } = await import('@/actions/workout-actions')
    const { result } = setup()
    await act(async () => { await result.current.openPeriodReport('month') })
    await waitFor(() => expect(result.current.periodReport).not.toBeNull())

    const enviado = (generatePeriodReportInsights as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      stats: Record<string, unknown>
    }
    expect(enviado.stats.sessions).toBeUndefined()
    // O nome do exercício SEMPRE foi para a IA (top exercícios) e deve continuar
    // indo — o que não pode ir é a série a série. `rpe` só existe no detalhe.
    expect(JSON.stringify(enviado.stats)).not.toContain('"rpe"')
  })
})
