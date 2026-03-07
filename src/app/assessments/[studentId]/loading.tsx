'use client'

export default function AssessmentLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4 max-w-3xl mx-auto">
      <div className="h-6 bg-zinc-800 rounded w-44 mb-4" />

      {/* Student info */}
      <div className="bg-zinc-800/40 rounded-xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 bg-zinc-700 rounded-full" />
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-zinc-700 rounded w-36" />
          <div className="h-3 bg-zinc-700/60 rounded w-20" />
        </div>
      </div>

      {/* Measurements skeleton */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 bg-zinc-800/40 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
