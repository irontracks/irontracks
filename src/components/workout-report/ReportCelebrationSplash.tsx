'use client'

import NextImage from 'next/image'

type AnyObj = Record<string, unknown>

interface ReportCelebrationSplashProps {
    safeSession: AnyObj | null
    onDismiss: () => void
}

export const ReportCelebrationSplash = ({ safeSession, onDismiss }: ReportCelebrationSplashProps) => (
    <button
        type="button"
        className="fixed inset-0 z-[1200] flex flex-col items-end justify-end bg-neutral-950 overflow-hidden w-full border-0 p-0 text-left"
        onClick={onDismiss}
    >
        {/* Victory hero — full screen background */}
        <div className="absolute inset-0">
            <NextImage
                src="/report-victory.png"
                alt=""
                fill
                priority
                unoptimized
                className="object-cover object-center"
            />
            {/* Bottom gradient so text is readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-neutral-950/20" />
            {/* Top vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-transparent to-transparent" />
        </div>

        {/* Content — pinned to bottom */}
        <div className="relative z-10 w-full px-6 pb-16 flex flex-col items-center text-center gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-500">IronTracks</div>
            <div className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-white leading-tight">
                Treino Finalizado!
            </div>
            <div className="text-base font-black text-yellow-400 max-w-xs truncate">
                {String(safeSession?.workoutTitle || '')}
            </div>
            {Number(safeSession?.totalTime) > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full mt-1"
                    style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)' }}>
                    <span className="text-xl font-black text-white">
                        {Math.floor(Number(safeSession?.totalTime ?? 0) / 60)}min
                    </span>
                    <span className="text-[10px] font-black uppercase text-yellow-500">duração</span>
                </div>
            )}
            <div className="mt-3 text-xs font-bold text-neutral-400">Toque para ver o relatório</div>
        </div>
    </button>
)
