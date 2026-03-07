/**
 * @module useOptimisticAction
 *
 * Generic hook for optimistic UI updates. Instantly mutates local state
 * while the server request runs in the background. Rolls back to the
 * previous value on failure and optionally shows an error toast.
 *
 * @example
 * ```ts
 * const { value, execute } = useOptimisticAction(false, async (next) => {
 *   await api.toggleLike(postId, next)
 * })
 * <button onClick={() => execute(!value)}>Like</button>
 * ```
 */
'use client'

import { useState, useCallback, useRef } from 'react'

export interface UseOptimisticActionOptions<T> {
  /** Called when the server action fails. Receives the error. */
  onError?: (error: unknown) => void
  /** Called after successful server confirmation. */
  onSuccess?: (confirmed: T) => void
}

export function useOptimisticAction<T>(
  initialValue: T,
  serverAction: (nextValue: T) => Promise<T | void>,
  options?: UseOptimisticActionOptions<T>,
) {
  const [value, setValue] = useState<T>(initialValue)
  const [isPending, setIsPending] = useState(false)
  const rollbackRef = useRef<T>(initialValue)

  const execute = useCallback(
    async (nextValue: T) => {
      // Save rollback point
      rollbackRef.current = value
      // Instant optimistic update
      setValue(nextValue)
      setIsPending(true)

      try {
        const confirmed = await serverAction(nextValue)
        // Server may return refined value
        if (confirmed !== undefined) setValue(confirmed)
        options?.onSuccess?.(confirmed !== undefined ? confirmed : nextValue)
      } catch (err) {
        // Rollback on failure
        setValue(rollbackRef.current)
        options?.onError?.(err)
      } finally {
        setIsPending(false)
      }
    },
    [value, serverAction, options],
  )

  return { value, setValue, execute, isPending } as const
}

/**
 * Convenience wrapper for boolean toggles (like/unlike, follow/unfollow).
 */
export function useOptimisticToggle(
  initial: boolean,
  serverAction: (next: boolean) => Promise<boolean | void>,
  options?: UseOptimisticActionOptions<boolean>,
) {
  const result = useOptimisticAction(initial, serverAction, options)
  const toggle = useCallback(() => result.execute(!result.value), [result])
  return { ...result, toggle }
}
