'use client'

export default function AssessmentsLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="h-6 bg-zinc-800 rounded w-44 mb-6" />

      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        <div className="h-9 w-28 rounded-full bg-zinc-800" />
        <div className="h-9 w-28 rounded-full bg-zinc-800/50" />
      </div>

      {/* Assessment cards */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-zinc-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-zinc-700 rounded w-32" />
              <div className="h-3 bg-zinc-700/60 rounded w-20" />
            </div>
            <div className="h-8 w-8 bg-zinc-700/40 rounded-lg" />
          </div>
          <div className="flex gap-4">
            <div className="h-3 bg-zinc-700/40 rounded w-16" />
            <div className="h-3 bg-zinc-700/40 rounded w-16" />
            <div className="h-3 bg-zinc-700/40 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
