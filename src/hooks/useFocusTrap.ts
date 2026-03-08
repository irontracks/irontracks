'use client'

import React, { useEffect, useRef, useCallback } from 'react'

/**
 * Traps keyboard focus inside a container element.
 *
 * Features:
 * - Tab / Shift+Tab cycle only through focusable elements within the container
 * - Auto-focuses the first focusable element on open
 * - Escape key calls onClose (if provided)
 * - Restores focus to previously focused element on close
 */
export function useFocusTrap(isOpen: boolean, onClose?: () => void) {
    const containerRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<Element | null>(null)

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Escape → close
        if (e.key === 'Escape' && onClose) {
            e.preventDefault()
            e.stopPropagation()
            onClose()
            return
        }

        if (e.key !== 'Tab') return
        const container = containerRef.current
        if (!container) return

        const focusable = container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable.length) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault()
                last.focus()
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return

        // Save currently focused element to restore later
        previousFocusRef.current = document.activeElement

        const container = containerRef.current
        if (!container) return

        // Auto-focus first focusable element
        const focusable = container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length) {
            requestAnimationFrame(() => focusable[0]?.focus())
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            // Restore focus to the element that was focused before the modal opened
            if (previousFocusRef.current instanceof HTMLElement) {
                previousFocusRef.current.focus()
            }
        }
    }, [isOpen, handleKeyDown])

    return containerRef
}
