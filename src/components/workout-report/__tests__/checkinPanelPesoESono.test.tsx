import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ReportCheckinPanel } from '../ReportCheckinPanel'

/**
 * Peso do dia e sono (02/09/2026) — os dois já eram coletados no check-in
 * pré-treino (o motor de carga automática usa os dois) e nunca chegavam a
 * lugar nenhum: nem à tela, nem ao PDF. Ver `lib/workout/checkinFields.ts`,
 * fonte única compartilhada com o gerador do PDF.
 */
describe('ReportCheckinPanel — peso do dia e sono', () => {
    it('mostra os dois quando o check-in os tem', () => {
        render(
            <ReportCheckinPanel
                preCheckin={{ energy: 5, soreness: 2, weight: '82,5', sleepHours: '7,5', notes: '' }}
                postCheckin={null}
                recommendations={[]}
            />
        )
        expect(screen.getByText('82,5 kg')).toBeTruthy()
        expect(screen.getByText('7,5 h')).toBeTruthy()
    })

    it('ausentes viram travessão, não 0 nem NaN', () => {
        render(
            <ReportCheckinPanel
                preCheckin={{ energy: 3 }}
                postCheckin={null}
                recommendations={[]}
            />
        )
        expect(screen.queryByText('0 kg')).toBeNull()
        expect(screen.queryByText(/NaN/)).toBeNull()
    })

    it('sem check-in nem check-out, o painel inteiro some (nada pra mostrar)', () => {
        const { container } = render(
            <ReportCheckinPanel preCheckin={null} postCheckin={null} recommendations={[]} />
        )
        expect(container.textContent).toBe('')
    })
})
