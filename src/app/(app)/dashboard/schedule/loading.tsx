import { SkeletonList } from '@/components/ui/Skeleton'

export default function ScheduleLoading() {
  return (
    <div className="w-full min-h-screen bg-neutral-900 p-4 space-y-4">
      {/* Header */}
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-44 bg-neutral-800 rounded" />
        <div className="h-4 w-56 bg-neutral-800/60 rounded" />
      </div>

      {/* Calendar skeleton */}
      <div className="animate-pulse">
        <div className="h-48 rounded-xl bg-neutral-800/40 border border-neutral-800/50" />
      </div>

      {/* Scheduled workouts */}
      <SkeletonList count={3} />
    </div>
  )
}
