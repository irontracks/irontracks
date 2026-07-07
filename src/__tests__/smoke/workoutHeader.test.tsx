/**
 * Smoke test — WorkoutHeader
 * Verifies that the editor toolbar renders all action buttons with aria-labels.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { WorkoutHeader } from '@/components/ExerciseEditor/EditorHeader'

const noop = () => { }

const defaultProps = {
    saving: false,
    fileInputRef: createRef<HTMLInputElement>(),
    onSave: noop,
    onCancel: noop,
    onImportJsonClick: noop,
    onImportJson: noop,
}

describe('WorkoutHeader — smoke tests', () => {
    it('renders Editar Treino title', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByText('Editar Treino')).toBeInTheDocument()
    })

    it('renders save button with aria-label', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/salvar treino/i)).toBeInTheDocument()
    })

    it('renders close button with aria-label', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/fechar editor/i)).toBeInTheDocument()
    })

    it('renders the overflow menu trigger', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/mais opções/i)).toBeInTheDocument()
    })

    it('exposes JSON import inside the overflow menu', () => {
        render(<WorkoutHeader {...defaultProps} />)
        // Menu começa fechado — o item de JSON não deve aparecer ainda.
        expect(screen.queryByText(/carregar json/i)).not.toBeInTheDocument()
        fireEvent.click(screen.getByLabelText(/mais opções/i))
        expect(screen.getByText(/carregar json/i)).toBeInTheDocument()
    })

    it('calls onImportJsonClick when the JSON menu item is clicked', () => {
        const onImportJsonClick = vi.fn()
        render(<WorkoutHeader {...defaultProps} onImportJsonClick={onImportJsonClick} />)
        fireEvent.click(screen.getByLabelText(/mais opções/i))
        fireEvent.click(screen.getByText(/carregar json/i))
        expect(onImportJsonClick).toHaveBeenCalledTimes(1)
    })

    it('keeps the hidden file input for JSON selection', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/selecionar arquivo json do treino/i)).toBeInTheDocument()
    })

    it('disables save button when saving is true', () => {
        render(<WorkoutHeader {...defaultProps} saving={true} />)
        expect(screen.getByLabelText(/salvar treino/i)).toBeDisabled()
    })

    it('calls onSave when save button is clicked', () => {
        const onSave = vi.fn()
        render(<WorkoutHeader {...defaultProps} onSave={onSave} />)
        fireEvent.click(screen.getByLabelText(/salvar treino/i))
        expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when close button is clicked', () => {
        const onCancel = vi.fn()
        render(<WorkoutHeader {...defaultProps} onCancel={onCancel} />)
        fireEvent.click(screen.getByLabelText(/fechar editor/i))
        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
