export const metadata = {
  title: 'IronTracks - Offline',
}

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.35em] text-neutral-500 font-bold">Offline</div>
        <h1 className="mt-3 text-xl font-black text-white">Você está sem conexão</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Assim que a internet voltar, a sessão será restaurada automaticamente.
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          Se o problema persistir, feche e reabra o app.
        </p>
      </div>
    </div>
  )
}
