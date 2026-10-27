/**
 * Os quatro cards de "Destaques da sessão" abrem a janela do PRÓPRIO detalhe.
 *
 * Pedido do dono (27/10/2026): tocar no card abre as informações que explicam
 * aquele número. O guard cobra a FIAÇÃO — cada card abre a janela certa, com o
 * nome de janela certo e o conteúdo que o pai entregou — porque as contas
 * (testadas em `highlightDetails.test.ts`) passam verdes com o card inerte.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', { alt: String(props.alt ?? '') }),
}))

import { ReportHighlightsPanel } from '@/components/workout-report/ReportHighlightsPanel'

const props = {
  prCount: 2,
  allTimePrCount: 1,
  detectedPrs: [
    { exerciseName: 'Leg press horizontal unilateral', e1rm: 207.2, prevE1rm: 190, isAllTimePr: true, recordeAnterior: 200 },
    { exerciseName: 'Cadeira extensora', e1rm: 95, prevE1rm: 0, isAllTimePr: false, recordeAnterior: 110 },
  ],
  volumeDeltaAbs: -3860,
  volumeDelta: -10.4,
  currentVolume: 33292,
  setCompletionPct: 94,
  setsCompleted: 16,
  setsPlanned: 17,
  volumeDetalhe: [
    { chave: 'leg', nome: 'Leg press horizontal unilateral', volumeKg: 20000, series: 6 },
    { chave: 'ext', nome: 'Cadeira extensora', volumeKg: 13292, series: 4 },
  ],
  comparacaoVolume: [
    { chave: 'stiff', nome: 'Stiff', atualKg: 0, anteriorKg: 4000, deltaKg: -4000 },
    { chave: 'leg', nome: 'Leg press horizontal unilateral', atualKg: 20000, anteriorKg: 19860, deltaKg: 140 },
  ],
  seriesDetalhe: [
    {
      nome: 'Cadeira extensora', planejadas: 2, feitas: 1, series: [
        { numero: 1, feita: true, peso: 22.5, reps: 12, marca: null },
        { numero: 2, feita: false, peso: 0, reps: 0, marca: null },
      ],
    },
  ],
}

const abrir = (nome: RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }))

describe('cards de destaque abrem o detalhe', () => {
  it('PRs → recordes, com a comparação e o recorde histórico', () => {
    render(<ReportHighlightsPanel {...props} />)
    abrir(/Ver detalhes: 2 PRs alcançados/)
    const dlg = screen.getByRole('dialog', { name: 'Recordes da sessão' })
    expect(dlg.textContent).toContain('Cadeira extensora')
    expect(dlg.textContent).toContain('Última vez: 190,0 kg')
    expect(dlg.textContent).toContain('o anterior era 200,0 kg')
    expect(dlg.textContent).toContain('Primeira vez')
  })

  it('variação → comparação por exercício, incluindo o que não foi feito hoje', () => {
    render(<ReportHighlightsPanel {...props} />)
    abrir(/Ver detalhes: abaixo da anterior/i)
    const dlg = screen.getByRole('dialog', { name: 'Comparação com a sessão anterior' })
    expect(dlg.textContent).toContain('Stiff')
    expect(dlg.textContent).toContain('Não feito hoje')
    expect(dlg.textContent).toContain('−3.860 kg')
  })

  it('volume total → volume de cada exercício', () => {
    render(<ReportHighlightsPanel {...props} />)
    abrir(/Ver detalhes: volume total/)
    const dlg = screen.getByRole('dialog', { name: 'Volume por exercício' })
    expect(dlg.textContent).toContain('20.000 kg')
    expect(dlg.textContent).toContain('60% do total')
  })

  it('séries completas → série a série, com a que faltou', () => {
    render(<ReportHighlightsPanel {...props} />)
    abrir(/Ver detalhes: séries completas/)
    const dlg = screen.getByRole('dialog', { name: 'Séries por exercício' })
    expect(dlg.textContent).toContain('22,5 kg × 12')
    expect(dlg.textContent).toContain('não feita')
    expect(dlg.textContent).toContain('faltou 1')
  })

  it('o X fecha a janela', () => {
    render(<ReportHighlightsPanel {...props} />)
    abrir(/Ver detalhes: volume total/)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
