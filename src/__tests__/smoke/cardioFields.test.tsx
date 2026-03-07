/**
 * Smoke test — CardioFields
 * Verifies that cardio inputs render with correct aria-labels and HIT toggle works.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardioFields } from '@/components/ExerciseEditor/CardioFields'
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

const defaultProps = {
    exercise: { name: 'Esteira', reps: '', rpe: '' },
    setDetails: [baseSet],
    onUpdateExercise: noop,
    onUpdateSetDetail: noop,
}

describe('CardioFields — smoke tests', () => {
    it('renders tempo and intensidade inputs with aria-labels', () => {
        render(<CardioFields {...defaultProps} />)
        expect(screen.getByLabelText(/tempo em minutos/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/intensidade percebida/i)).toBeInTheDocument()
    })

    it('renders the HIT mode toggle checkbox', () => {
        render(<CardioFields {...defaultProps} />)
        expect(screen.getByLabelText(/ativar modo hit/i)).toBeInTheDocument()
    })

    it('calls onUpdateSetDetail when HIT toggle is clicked', () => {
        const onUpdateSetDetail = vi.fn()
        render(<CardioFields {...defaultProps} onUpdateSetDetail={onUpdateSetDetail} />)
        const hitToggle = screen.getByLabelText(/ativar modo hit/i)
        fireEvent.click(hitToggle)
        expect(onUpdateSetDetail).toHaveBeenCalledWith(0, expect.objectContaining({ advanced_config: expect.anything() }))
    })

    it('shows HIT config fields when isHIT is active', () => {
        const hitSet: SetDetail = {
            ...baseSet,
            advanced_config: { isHIT: true, workSec: 30, restSec: 10 },
        }
        render(<CardioFields {...defaultProps} setDetails={[hitSet]} />)
        expect(screen.getByLabelText(/segundos de trabalho/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/segundos de descanso/i)).toBeInTheDocument()
    })

    it('shows equipment parameters section', () => {
        render(<CardioFields {...defaultProps} />)
        expect(screen.getByText(/parâmetros de equipamento/i)).toBeInTheDocument()
    })
})
