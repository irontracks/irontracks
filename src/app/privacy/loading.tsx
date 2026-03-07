'use client'

export default function PrivacyLoading() {
  return (
    <div className="animate-pulse p-6 space-y-4 max-w-3xl mx-auto">
      <div className="h-7 bg-zinc-800 rounded w-52 mb-6" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-zinc-800/60 rounded w-full" />
          <div className="h-4 bg-zinc-800/40 rounded w-5/6" />
          <div className="h-4 bg-zinc-800/30 rounded w-4/6" />
        </div>
      ))}
    </div>
  )
}
