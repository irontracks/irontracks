'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * Traps keyboard focus inside a container element.
 *
 * Features:
 * - Tab / Shift+Tab cycle only through focusable elements within the container
 * - Auto-focuses the first focusable element on open
 * - Escape key calls onClose (if provided)
 * - Restores focus to previously focused element on close
 */
const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(isOpen: boolean, onClose?: () => void) {
    const containerRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<Element | null>(null)
    // onClose num ref: assim o handler de teclado não precisa ser recriado quando
    // o pai passa um onClose inline (referência nova a cada render). Sem isto, o
    // efeito de auto-foco re-rodava a cada tecla e o foco PULAVA de volta pro
    // primeiro campo — bug do "cada número digitado pula pra caixa de nome".
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    })

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Escape → close
        if (e.key === 'Escape' && onCloseRef.current) {
            e.preventDefault()
            e.stopPropagation()
            onCloseRef.current()
            return
        }

        if (e.key !== 'Tab') return
        const container = containerRef.current
        if (!container) return

        const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
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

    // Auto-foco + restauração: SÓ quando abre/fecha (deps [isOpen]). NÃO pode
    // depender de handleKeyDown/onClose, senão re-roda a cada render e rouba o
    // foco do campo que o usuário está digitando.
    useEffect(() => {
        if (!isOpen) return

        // Guarda o elemento focado pra restaurar depois
        previousFocusRef.current = document.activeElement

        const container = containerRef.current
        if (!container) return

        const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusable.length) {
            requestAnimationFrame(() => focusable[0]?.focus())
        }

        return () => {
            // Restaura o foco pro elemento que estava focado antes do modal abrir
            if (previousFocusRef.current instanceof HTMLElement) {
                previousFocusRef.current.focus()
            }
        }
    }, [isOpen])

    // Listener de Tab/Escape em efeito separado (handleKeyDown é estável agora).
    useEffect(() => {
        if (!isOpen) return
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, handleKeyDown])

    return containerRef
}
