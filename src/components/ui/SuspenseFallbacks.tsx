'use client'

import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Reusable Suspense fallback components for granular loading states.
 * Designed to match the visual layout of the component they replace,
 * preventing layout shift during async loading.
 */

/** Small stat card skeleton (e.g. workouts count, streak, etc.) */
export function StatCardSkeleton() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-10" />
    </div>
  )
}

/** Row of stat cards */
export function StatsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Workout card in list */
export function WorkoutCardSkeleton() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  )
}

/** List of workout cards */
export function WorkoutListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <WorkoutCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Streak / badge section */
export function StreakSkeleton() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

/** Stories bar skeleton */
export function StoriesBarSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden py-2 px-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  )
}

/** Muscle map card skeleton */
export function MuscleMapSkeleton() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  )
}

/** Generic section with title skeleton */
export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}
