/**
 * @module useVirtualList
 *
 * Lightweight virtual list hook. Returns only the visible window of items
 * plus a buffer, dramatically reducing DOM nodes for long lists.
 *
 * Uses IntersectionObserver for scroll detection — no external dependencies.
 * For heavier use cases, prefer `@tanstack/react-virtual` (used in HistoryList).
 *
 * @param items     - Full array of items
 * @param options   - Configuration: itemHeight, overscan, containerRef
 * @returns `{ visibleItems, totalHeight, offsetTop, containerProps }`
 */
'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type RefObject } from 'react'

export interface UseVirtualListOptions {
  /** Height of each item in pixels */
  itemHeight: number
  /** Extra items to render above/below viewport (default: 5) */
  overscan?: number
}

export interface VirtualItem<T> {
  item: T
  index: number
  style: React.CSSProperties
}

export function useVirtualList<T>(
  items: T[],
  options: UseVirtualListOptions,
) {
  const { itemHeight, overscan = 5 } = options
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setContainerHeight(el.clientHeight)

    return () => observer.disconnect()
  }, [])

  // Track scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const totalHeight = items.length * itemHeight

  const visibleItems = useMemo<VirtualItem<T>[]>(() => {
    if (!containerHeight) return []

    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIdx = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
    )

    const result: VirtualItem<T>[] = []
    for (let i = startIdx; i <= endIdx; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: 'absolute',
          top: i * itemHeight,
          height: itemHeight,
          left: 0,
          right: 0,
        },
      })
    }
    return result
  }, [items, scrollTop, containerHeight, itemHeight, overscan])

  const containerProps = {
    ref: containerRef,
    style: { position: 'relative' as const, overflow: 'auto' as const },
  }

  const innerProps = {
    style: { height: totalHeight, position: 'relative' as const },
  }

  return { visibleItems, totalHeight, containerProps, innerProps, containerRef } as const
}
