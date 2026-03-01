/**
 * Smoke test — WorkoutHeader
 * Verifies that the editor toolbar renders all action buttons with aria-labels.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { WorkoutHeader } from '@/components/ExerciseEditor/WorkoutHeader'

const noop = () => { }

const defaultProps = {
    saving: false,
    scannerLoading: false,
    scannerFileInputRef: createRef<HTMLInputElement>(),
    fileInputRef: createRef<HTMLInputElement>(),
    onSave: noop,
    onCancel: noop,
    onScannerFileClick: noop,
    onScannerFileChange: noop,
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

    it('renders scanner import button with aria-label', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/importar treino via ia/i)).toBeInTheDocument()
    })

    it('renders JSON import button with aria-label', () => {
        render(<WorkoutHeader {...defaultProps} />)
        expect(screen.getByLabelText(/carregar treino a partir de arquivo json/i)).toBeInTheDocument()
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
