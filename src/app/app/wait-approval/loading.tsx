'use client'

export default function WaitApprovalLoading() {
  return (
    <div className="animate-pulse flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-16 h-16 rounded-full bg-zinc-800 mb-6" />
      <div className="h-5 bg-zinc-800 rounded w-48 mb-3" />
      <div className="h-4 bg-zinc-800/60 rounded w-64 mb-2" />
      <div className="h-4 bg-zinc-800/40 rounded w-52" />
    </div>
  )
}
