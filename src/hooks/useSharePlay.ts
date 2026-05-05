/**
 * useSharePlay
 *
 * High-level hook that wraps the native SharePlay (Feature 18) plumbing for
 * the active workout view. Handles:
 *
 *   • State sync — current SharePlayState ('inactive' | 'waiting' | 'joined' | …)
 *   • Participant count — number of FaceTime peers actively in the workout
 *   • Outgoing — `sendSetUpdate(...)` broadcasts the user's just-completed set
 *   • Incoming — `onPeerSetDone` fires when another participant completes a set
 *
 * No-op on non-iOS. Always safe to call — when not in a FaceTime session, the
 * activate path returns gracefully and the start function tells the caller why.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addSharePlayMessageListener,
  addSharePlayParticipantsListener,
  addSharePlayStateListener,
  endSharePlayWorkout,
  getSharePlayState,
  sendSharePlayMessage,
  startSharePlayWorkout,
  type SharePlayIncomingMessage,
  type SharePlayInfo,
  type SharePlayState,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

export interface PeerSetUpdate {
  exIdx: number
  setIdx: number
  weight?: number | null
  reps?: number | null
  rpe?: number | null
  fromParticipantId: string
  sentAtMs: number
}

interface UseSharePlayArgs {
  /** When defined, the hook will start an activity for this workout when
   *  the user taps the "Treinar Junto" button. Pass null to disable. */
  workout: { id: string; name: string } | null
  /** Display name shown in the SharePlay tray invite. */
  hostName?: string
  /** Fires when a peer marks a set as done. */
  onPeerSetDone?: (update: PeerSetUpdate) => void
}

export interface UseSharePlayReturn {
  state: SharePlayState
  info: SharePlayInfo
  isActive: boolean
  /** Convenience: state === 'joined' && participantCount > 1. */
  hasPeers: boolean
  /** Begin a SharePlay activity for the configured workout. */
  start: () => Promise<{ ok: boolean; error?: string }>
  /** End the current SharePlay session. Safe to call when none is active. */
  end: () => Promise<void>
  /** Broadcast a "set completed" event to every peer. No-op when no session. */
  sendSetUpdate: (update: { exIdx: number; setIdx: number; weight?: number | null; reps?: number | null; rpe?: number | null }) => Promise<void>
}

const EMPTY_INFO: SharePlayInfo = { active: false, participantCount: 0 }

export function useSharePlay({ workout, hostName, onPeerSetDone }: UseSharePlayArgs): UseSharePlayReturn {
  const [state, setState] = useState<SharePlayState>('inactive')
  const [info, setInfo] = useState<SharePlayInfo>(EMPTY_INFO)

  // Stable ref so the message handler doesn't re-subscribe on every render.
  // The ref is updated inside an effect (not during render) to satisfy the
  // react-hooks/refs lint rule.
  const onPeerSetDoneRef = useRef<UseSharePlayArgs['onPeerSetDone']>(onPeerSetDone)
  useEffect(() => {
    onPeerSetDoneRef.current = onPeerSetDone
  }, [onPeerSetDone])

  // ── Initial state + listeners ─────────────────────────────────────────────
  useEffect(() => {
    if (!isIosNative()) return

    let cancelled = false
    void getSharePlayState().then((current) => {
      if (cancelled) return
      setInfo(current)
      if (current.active) setState('joined')
    })

    const offState = addSharePlayStateListener((s) => setState(s))
    const offParticipants = addSharePlayParticipantsListener((count) => {
      setInfo((prev) => ({ ...prev, participantCount: count, active: count > 0 || prev.active }))
    })
    const offMessages = addSharePlayMessageListener((msg: SharePlayIncomingMessage) => {
      if (msg.type !== 'set_done') return
      const handler = onPeerSetDoneRef.current
      if (!handler) return
      const p = msg.payload || {}
      const exIdx = Number(p.exIdx)
      const setIdx = Number(p.setIdx)
      if (!Number.isFinite(exIdx) || !Number.isFinite(setIdx)) return
      try {
        handler({
          exIdx,
          setIdx,
          weight: typeof p.weight === 'number' ? p.weight : null,
          reps: typeof p.reps === 'number' ? p.reps : null,
          rpe: typeof p.rpe === 'number' ? p.rpe : null,
          fromParticipantId: msg.fromParticipantId,
          sentAtMs: msg.sentAtMs,
        })
      } catch { /* swallow */ }
    })

    return () => {
      cancelled = true
      try { offState() } catch { /* swallow */ }
      try { offParticipants() } catch { /* swallow */ }
      try { offMessages() } catch { /* swallow */ }
    }
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!isIosNative()) return { ok: false, error: 'not_ios' }
    if (!workout?.id) return { ok: false, error: 'no_workout' }
    setState('waiting')
    const result = await startSharePlayWorkout({
      workoutId: workout.id,
      workoutName: workout.name,
      hostName,
    })
    if (!result.ok) {
      setState('inactive')
    }
    return result
  }, [workout, hostName])

  const end = useCallback(async () => {
    await endSharePlayWorkout()
    setState('inactive')
    setInfo(EMPTY_INFO)
  }, [])

  const sendSetUpdate = useCallback(async (update: { exIdx: number; setIdx: number; weight?: number | null; reps?: number | null; rpe?: number | null }) => {
    if (state !== 'joined') return
    await sendSharePlayMessage('set_done', {
      exIdx: update.exIdx,
      setIdx: update.setIdx,
      weight: update.weight ?? null,
      reps: update.reps ?? null,
      rpe: update.rpe ?? null,
    })
  }, [state])

  const isActive = state === 'joined' || state === 'waiting'
  const hasPeers = state === 'joined' && info.participantCount > 1

  return { state, info, isActive, hasPeers, start, end, sendSetUpdate }
}
