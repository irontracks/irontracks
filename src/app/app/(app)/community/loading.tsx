'use client'

export default function CommunityLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="h-6 bg-zinc-800 rounded w-36 mb-6" />

      {/* Feed skeleton */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-zinc-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-700 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-zinc-700 rounded w-28" />
              <div className="h-3 bg-zinc-700/60 rounded w-16" />
            </div>
          </div>
          <div className="h-40 bg-zinc-700/30 rounded-lg" />
          <div className="flex gap-4">
            <div className="h-4 bg-zinc-700/50 rounded w-12" />
            <div className="h-4 bg-zinc-700/50 rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  )
}
