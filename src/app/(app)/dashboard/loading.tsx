'use client'

export default function DashboardLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-zinc-800 rounded-full" />
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-zinc-800 rounded w-40" />
          <div className="h-3 bg-zinc-800/60 rounded w-24" />
        </div>
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-800/50 rounded-xl" />
        ))}
      </div>

      {/* Workout list skeleton */}
      <div className="space-y-3 mt-6">
        <div className="h-4 bg-zinc-800/60 rounded w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-zinc-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
