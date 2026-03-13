'use client'

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoadingScreen from '@/components/LoadingScreen'

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
