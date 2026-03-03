'use client'

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'

const IronTracksAppClient = dynamic(() => import('./IronTracksAppClient'), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-neutral-400 text-sm font-bold tracking-wide">Carregando...</span>
            </div>
        </div>
    ),
})

export default function DashboardClientEntry(props: Record<string, unknown>) {
    return (
        <ErrorBoundary>
            <IronTracksAppClient {...props} />
        </ErrorBoundary>
    )
}
