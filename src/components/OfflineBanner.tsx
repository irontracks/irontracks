'use client'

import React, { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineBanner() {
    // Lazy initializer — correct way to read navigator.onLine on first render
    const [isOffline, setIsOffline] = useState(() =>
        typeof navigator !== 'undefined' ? !navigator.onLine : false
    )
    const [justReconnected, setJustReconnected] = useState(false)

    useEffect(() => {
        const handleOffline = () => {
            setIsOffline(true)
            setJustReconnected(false)
        }

        const handleOnline = () => {
            setIsOffline(false)
            setJustReconnected(true)
            setTimeout(() => setJustReconnected(false), 3000)
        }

        window.addEventListener('offline', handleOffline)
        window.addEventListener('online', handleOnline)
        return () => {
            window.removeEventListener('offline', handleOffline)
            window.removeEventListener('online', handleOnline)
        }
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
