'use client'

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'

// Minimal fallback: just the background color matching LoadingScreen.
// In Capacitor the JS is local so this barely shows; on web it prevents a blank flash.
const LoadingFallback = () => <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a' }} />

const IronTracksAppClient = dynamic(() => import('./IronTracksAppClient'), {
    ssr: false,
    loading: () => <LoadingFallback />,
})

export default function DashboardClientEntry(props: Record<string, unknown>) {
    return (
        <ErrorBoundary>
            <IronTracksAppClient {...props} />
        </ErrorBoundary>
    )
}
