'use client'

import dynamic from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
// No loading fallback needed — AppLoadingOverlay (root layout) covers this transition.
const IronTracksAppClient = dynamic(() => import('./IronTracksAppClient'), {
    ssr: false,
    loading: () => null,
})

export default function DashboardClientEntry(props: Record<string, unknown>) {
    return (
        <ErrorBoundary>
            <IronTracksAppClient {...props} />
        </ErrorBoundary>
    )
}
