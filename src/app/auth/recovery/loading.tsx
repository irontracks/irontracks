'use client'

export default function RecoveryLoading() {
  return (
    <div className="animate-pulse flex flex-col items-center justify-center min-h-[60vh] p-4 space-y-4">
      <div className="w-16 h-16 bg-zinc-800 rounded-full" />
      <div className="h-5 bg-zinc-800 rounded w-48" />
      <div className="h-10 bg-zinc-800/60 rounded-lg w-72 mt-2" />
      <div className="h-10 bg-zinc-800/40 rounded-lg w-40 mt-4" />
    </div>
  )
}
