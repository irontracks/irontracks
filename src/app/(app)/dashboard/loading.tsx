export default function DashboardLoading() {
  return (
    <div className="w-full min-h-screen bg-neutral-900 flex flex-col">
      {/* Header skeleton */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-800" />
          <div className="space-y-1.5">
            <div className="h-4 w-28 bg-neutral-800 rounded" />
            <div className="h-3 w-20 bg-neutral-800/60 rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-lg bg-neutral-800" />
          <div className="w-8 h-8 rounded-lg bg-neutral-800" />
        </div>
      </header>

      {/* Streak / stats bar */}
      <div className="flex gap-3 px-4 py-3 animate-pulse">
        <div className="flex-1 h-16 rounded-xl bg-neutral-800/50" />
        <div className="flex-1 h-16 rounded-xl bg-neutral-800/50" />
        <div className="flex-1 h-16 rounded-xl bg-neutral-800/50" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-2 px-4 pb-3 animate-pulse">
        <div className="h-9 w-24 rounded-full bg-neutral-800" />
        <div className="h-9 w-24 rounded-full bg-neutral-800/50" />
        <div className="h-9 w-24 rounded-full bg-neutral-800/50" />
      </div>

      {/* Workout cards skeleton */}
      <div className="flex-1 px-4 space-y-3 pb-24 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-neutral-800/40 border border-neutral-800/50"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>

      {/* Bottom nav skeleton */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-950 border-t border-neutral-800 flex items-center justify-around px-6 pb-safe animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-6 h-6 rounded bg-neutral-800" />
        ))}
      </div>
    </div>
  )
}
