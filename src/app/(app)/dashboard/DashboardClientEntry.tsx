'use client'

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoadingScreen from '@/components/LoadingScreen'

// Use the real LoadingScreen as fallback so that client-side navigation from
// LoginGate → Dashboard shows a seamless logo instead of a black flash.
const IronTracksAppClient = dynamic(() => import('./IronTracksAppClient'), {
    ssr: false,
    loading: () => <LoadingScreen />,
})

export default function DashboardClientEntry(props: Record<string, unknown>) {
    return (
        <ErrorBoundary>
            <IronTracksAppClient {...props} />
        </ErrorBoundary>
    )
}
