import { useEffect, useState } from 'react';

/**
 * useWorkoutTicker
 *
 * Provides a 1-second clock tick used throughout the active workout UI
 * (elapsed time, rest timer display, timeout watchdogs).
 *
 * Pauses automatically when the document tab is hidden to avoid
 * unnecessary re-renders in the background.
 */
export function useWorkoutTicker() {
    const [ticker, setTicker] = useState<number>(() => Date.now());
    const [timerMinimized, setTimerMinimized] = useState<boolean>(true);

    useEffect(() => {
        const id = setInterval(() => {
            try {
                if (typeof document !== 'undefined' && document.hidden) return;
            } catch { }
            setTicker(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    return { ticker, timerMinimized, setTimerMinimized };
}
