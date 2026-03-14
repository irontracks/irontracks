'use client'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`rounded-md bg-neutral-800/80 relative overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Gold shimmer sweep */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.06) 45%, rgba(234,179,8,0.1) 50%, rgba(234,179,8,0.06) 55%, transparent 100%)',
          animation: 'shimmer 1.8s ease-in-out infinite',
        }}
      />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-4/5" />
    </div>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
