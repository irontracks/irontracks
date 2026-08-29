import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * "Vou descansar" precisa ter volta.
 *
 * O card virava informativo puro: quem tocasse por engano ficava sem o atalho
 * de treinar E com a meta de calorias rebaixada (medido na conta de teste:
 * −442 kcal) até a virada do dia. A capacidade de desfazer já existia —
 * `setRestDayIntent` faz upsert e dispara o evento que o card escuta —, faltava
 * o botão.
 */

const setRestDayIntent = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/nutrition/restDayIntent', () => ({
    setRestDayIntent: (...a: unknown[]) => setRestDayIntent(...a),
}))
vi.mock('@/utils/native/irontracksNative', () => ({ triggerHaptic: vi.fn() }))

import { QuickStartCard } from '../QuickStartCard'

const treinos = [{ id: 'w1', title: 'SEG · Upper B', exercises: [{ name: 'Supino', sets: 3 }] }]

beforeEach(() => setRestDayIntent.mockClear())
afterEach(() => cleanup())

describe('dia de descanso — a saída', () => {
    it('oferece desfazer, e desfazer grava "vou treinar"', () => {
        render(
            <QuickStartCard
                workouts={treinos as never}
                onStartSession={() => { }}
                restingToday
                userId="u-1"
            />,
        )
        expect(screen.getByText('Dia de descanso')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Mudei de ideia/i }))
        expect(setRestDayIntent).toHaveBeenCalledWith('u-1', true)
    })

    it('sem userId não promete o que não pode cumprir', () => {
        render(
            <QuickStartCard
                workouts={treinos as never}
                onStartSession={() => { }}
                restingToday
            />,
        )
        expect(screen.getByText('Dia de descanso')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Mudei de ideia/i })).toBeNull()
    })

    it('fora do dia de descanso o botão não aparece', () => {
        render(
            <QuickStartCard
                workouts={treinos as never}
                onStartSession={() => { }}
                userId="u-1"
            />,
        )
        expect(screen.queryByRole('button', { name: /Mudei de ideia/i })).toBeNull()
    })
})
