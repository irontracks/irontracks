import { SkeletonList } from '@/components/ui/Skeleton'

export default function NutritionLoading() {
  return (
    <div className="w-full min-h-screen bg-neutral-900 p-4 space-y-4">
      {/* Header skeleton */}
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-40 bg-neutral-800 rounded" />
        <div className="h-4 w-64 bg-neutral-800/60 rounded" />
      </div>

      {/* Macro cards */}
      <div className="grid grid-cols-3 gap-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-neutral-800/40 border border-neutral-800/50" />
        ))}
      </div>

      {/* Meals list */}
      <SkeletonList count={4} />
    </div>
  )
}
