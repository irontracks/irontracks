import { SkeletonList } from '@/components/ui/Skeleton'

export default function VipLoading() {
  return (
    <div className="w-full min-h-screen bg-neutral-900 p-4 space-y-4">
      {/* VIP header */}
      <div className="animate-pulse space-y-3">
        <div className="h-7 w-32 bg-neutral-800 rounded" />
        <div className="h-4 w-52 bg-neutral-800/60 rounded" />
      </div>

      {/* VIP status card */}
      <div className="animate-pulse">
        <div className="h-28 rounded-2xl bg-gradient-to-br from-neutral-800/60 to-neutral-800/30 border border-yellow-900/20" />
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-neutral-800/40 border border-neutral-800/50" />
        ))}
      </div>

      <SkeletonList count={2} />
    </div>
  )
}
