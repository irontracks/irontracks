'use client'

import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

function subscribeToNetwork(callback: () => void) {
    window.addEventListener('offline', callback)
    window.addEventListener('online', callback)
    return () => {
        window.removeEventListener('offline', callback)
        window.removeEventListener('online', callback)
    }
}

export default function OfflineBanner() {
    // useSyncExternalStore: server snapshot = false (avoids hydration mismatch),
    // client snapshot reads actual navigator.onLine after hydration.
    const isOffline = useSyncExternalStore(
        subscribeToNetwork,
        () => !navigator.onLine,
        () => false,
    )
    const [justReconnected, setJustReconnected] = useState(false)

    useEffect(() => {
        const handleOnline = () => {
            setJustReconnected(true)
            setTimeout(() => setJustReconnected(false), 3000)
        }
        window.addEventListener('online', handleOnline)
        return () => window.removeEventListener('online', handleOnline)
    }, [])

    if (!isOffline && !justReconnected) return null

    if (justReconnected) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[99999] flex items-center justify-center gap-2 py-2 px-4 bg-green-600 text-white text-sm font-bold animate-slide-down">
                <Wifi size={15} />
                Conexão restaurada ✓
            </div>
        )
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-[99999] flex items-center justify-center gap-2 py-2 px-4 bg-red-600 text-white text-sm font-bold">
            <WifiOff size={15} className="animate-pulse" />
            Sem conexão com a internet 📡
        </div>
    )
}
