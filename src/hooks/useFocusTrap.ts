'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * Traps keyboard focus inside a container element.
 * When the modal is open, Tab and Shift+Tab cycle only through
 * focusable elements within the container.
 */
export function useFocusTrap(isOpen: boolean) {
    const containerRef = useRef<HTMLDivElement>(null)

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key !== 'Tab') return
        const container = containerRef.current
        if (!container) return

        const focusable = container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
    }, [])

    useEffect(() => {
        if (!isOpen) return
        const container = containerRef.current
        if (!container) return

        // Auto-focus first focusable element
        const focusable = container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length) {
            // Focus the close button or first element after a tick
            requestAnimationFrame(() => focusable[0]?.focus())
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, handleKeyDown])

    return containerRef
}
