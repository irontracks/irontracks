/**
 * Smoke test — SetDetailsSection
 * Verifies that set detail rows render with correct structure, aria-labels, and Drop Set button.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetDetailsSection } from '@/components/ExerciseEditor/SetDetailsSection'
import type { SetDetail } from '@/components/ExerciseEditor/types'

const noop = () => { }

const baseSet: SetDetail = {
    set_number: 1,
    weight: null,
    reps: '',
    rpe: null,
    is_warmup: false,
    advanced_config: null,
}

describe('SetDetailsSection — smoke tests', () => {
    it('renders nothing when setDetails is empty', () => {
        const { container } = render(
            <SetDetailsSection
                setDetails={[]}
                safeMethod="Normal"
                exerciseIndex={0}
                onUpdateSetDetail={noop}
            />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders série header for each set', () => {
        const set2: SetDetail = { ...baseSet, set_number: 2 }
        render(
            <SetDetailsSection
                setDetails={[baseSet, set2]}
                safeMethod="Normal"
                exerciseIndex={0}
                onUpdateSetDetail={noop}
            />
        )
        expect(screen.getByText('Série 1')).toBeInTheDocument()
        expect(screen.getByText('Série 2')).toBeInTheDocument()
    })

    it('renders carga / reps / RPE inputs with aria-labels for Normal method', () => {
        render(
            <SetDetailsSection
                setDetails={[baseSet]}
                safeMethod="Normal"
                exerciseIndex={0}
                onUpdateSetDetail={noop}
            />
        )
        expect(screen.getByLabelText(/carga em kg para série 1/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/repetições para série 1/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/rpe percebido para série 1/i)).toBeInTheDocument()
    })

    it('renders warmup checkbox only for the first set', () => {
        const set2: SetDetail = { ...baseSet, set_number: 2 }
        render(
            <SetDetailsSection
                setDetails={[baseSet, set2]}
                safeMethod="Normal"
                exerciseIndex={0}
                onUpdateSetDetail={noop}
            />
        )
        expect(screen.getByLabelText(/marcar como série de aquecimento/i)).toBeInTheDocument()
    })

    it('renders Drop Set button when advanced_config is array', () => {
        const dropSet: SetDetail = { ...baseSet, advanced_config: [{ weight: null, reps: '' }] }
        render(
            <SetDetailsSection
                setDetails={[dropSet]}
                safeMethod="Drop-set"
                exerciseIndex={0}
                onUpdateSetDetail={noop}
            />
        )
        expect(screen.getByLabelText(/adicionar drop/i)).toBeInTheDocument()
    })

    it('calls onUpdateSetDetail when carga input changes', () => {
        const onUpdateSetDetail = vi.fn()
        render(
            <SetDetailsSection
                setDetails={[baseSet]}
                safeMethod="Normal"
                exerciseIndex={0}
                onUpdateSetDetail={onUpdateSetDetail}
            />
        )
        const cargaInput = screen.getByLabelText(/carga em kg para série 1/i)
        fireEvent.change(cargaInput, { target: { value: '80' } })
        expect(onUpdateSetDetail).toHaveBeenCalledWith(0, 0, expect.objectContaining({ weight: 80 }))
    })
})
