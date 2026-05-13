/**
 * @module useLazyRef
 *
 * Ref com initializer preguiçoso (avaliado 1x). Substitui o pattern
 * `useRef(new Set())` que aloca `new Set()` a cada render mesmo que só o
 * primeiro seja preservado.
 *
 * Uso:
 *   const setRef = useLazyRef(() => new Set<string>())
 *   setRef.current.add('x')  // T garantido non-null pelo tipo
 *
 * Por que não `useState(() => ...)`:
 *   - O linter react-hooks/exhaustive-deps reclama de "ref objeto" como dep,
 *     gerando warnings espúrios.
 *
 * Por que não `useRef<T | null>(null) + if (cur === null) cur = init()`:
 *   - O tipo permanece `T | null` no escopo do consumer, forçando `!` ou check
 *     redundante em todo uso de `.current`.
 *
 * Esta implementação combina os dois: lazy init real (sem alocação por render)
 * + tipo de retorno `{ current: T }` (non-null) pra ergonomia.
 */
'use client'

import { useRef } from 'react'

export function useLazyRef<T>(init: () => T): { current: T } {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = init()
  return ref as { current: T }
}
