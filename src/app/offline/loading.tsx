'use client'

export default function OfflineLoading() {
  return (
    <div className="animate-pulse flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-14 h-14 rounded-full bg-zinc-800 mb-6" />
      <div className="h-5 bg-zinc-800 rounded w-40 mb-3" />
      <div className="h-4 bg-zinc-800/60 rounded w-56" />
    </div>
  )
}
