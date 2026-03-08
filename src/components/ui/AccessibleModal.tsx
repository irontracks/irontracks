'use client'

import React from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Accessible modal wrapper that provides:
 * - `role="dialog"` + `aria-modal="true"`
 * - Focus trap (Tab cycling within modal)
 * - Escape key to close
 * - Focus restoration on unmount
 * - Click-outside-to-close on the backdrop
 * - `aria-labelledby` / `aria-label` for screen readers
 *
 * Usage:
 * ```tsx
 * <AccessibleModal isOpen={open} onClose={close} ariaLabel="Settings">
 *   <h2>Settings</h2>
 *   ...
 * </AccessibleModal>
 * ```
 */
interface AccessibleModalProps {
    isOpen: boolean
    onClose: () => void
    ariaLabel?: string
    ariaLabelledBy?: string
    children: React.ReactNode
    /** Extra classes for the backdrop overlay */
    backdropClassName?: string
    /** Extra classes for the dialog container */
    className?: string
    /** If true, clicking the backdrop does NOT close the modal */
    preventBackdropClose?: boolean
}

export function AccessibleModal({
    isOpen,
    onClose,
    ariaLabel,
    ariaLabelledBy,
    children,
    backdropClassName = '',
    className = '',
    preventBackdropClose = false,
}: AccessibleModalProps) {
    const focusTrapRef = useFocusTrap(isOpen, onClose)

    if (!isOpen) return null

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClassName}`}
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={preventBackdropClose ? undefined : onClose}
            aria-hidden="true"
        >
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                className={className}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    )
}
