'use client'

export default function MarketplaceLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4 max-w-4xl mx-auto">
      <div className="h-6 bg-zinc-800 rounded w-40 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-zinc-800/40 rounded-xl overflow-hidden">
            <div className="h-32 bg-zinc-700/40" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-zinc-700 rounded w-3/4" />
              <div className="h-3 bg-zinc-700/60 rounded w-1/2" />
              <div className="h-8 bg-zinc-700/40 rounded-lg mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
