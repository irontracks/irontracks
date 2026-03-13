'use client'

import { StoriesBarSkeleton, SectionSkeleton, MuscleMapSkeleton, WorkoutCardSkeleton } from '@/components/ui/SuspenseFallbacks'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Full-page dashboard skeleton that visually matches the final layout.
 * Shown while critical data (streak, settings, profile) is still loading.
 * Prevents layout shift by reserving the exact same space as the real content.
 */
export function DashboardSkeleton({ showStoriesBar = true }: { showStoriesBar?: boolean }) {
  return (
    <div className="p-4 space-y-4 pb-24 animate-in fade-in duration-300">
      {/* Stories bar skeleton */}
      {showStoriesBar && <StoriesBarSkeleton />}

      {/* Tabs skeleton */}
      <div className="min-h-[64px]">
        <div
          className="rounded-2xl p-[1px] shadow-2xl shadow-black/60"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)' }}
        >
          <div
            className="rounded-[14px] p-1 flex gap-1"
            style={{
              background: 'linear-gradient(160deg, rgba(18,18,18,0.99) 0%, rgba(10,10,10,0.99) 100%)',
            }}
          >
            <div className="flex-1 min-h-[52px] px-3 rounded-xl flex flex-col items-center justify-center gap-[5px]">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            <div className="flex-1 min-h-[52px] px-3 rounded-xl flex flex-col items-center justify-center gap-[5px]">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-2.5 w-14" />
            </div>
          </div>
        </div>
      </div>

      {/* Iron Rank card skeleton */}
      <SectionSkeleton lines={2} />

      {/* Muscle map skeleton */}
      <MuscleMapSkeleton />

      {/* New Workout button skeleton */}
      <Skeleton className="h-[48px] w-full rounded-xl" />

      {/* Workout cards skeleton */}
      <div className="space-y-3">
        <WorkoutCardSkeleton />
        <WorkoutCardSkeleton />
        <WorkoutCardSkeleton />
      </div>
    </div>
  )
}
