'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight, Eye, Trash2, Loader2, Volume2, VolumeX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDialog } from '@/contexts/DialogContext'
import { Story, StoryGroup } from '@/types/social'
import { mediaKindFromUrl } from '@/utils/mediaUtils'

const MAX_VIDEO_SECONDS = 60
const PHOTO_SECONDS = 15
const MIN_VIDEO_SECONDS = 3
const STALL_THRESHOLD_MS = 2500
const STALL_CHECK_MS = 1200

const initials = (name: string) => {
  const n = String(name || '').trim()
  if (!n) return '?'
  return n.slice(0, 1).toUpperCase()
}

const formatAgo = (iso: string) => {
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const diffMin = Math.floor((Date.now() - ms) / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d`
}

const isIOSUserAgent = (ua: string) => {
  const s = String(ua || '')
  if (/(iPad|iPhone|iPod)/i.test(s)) return true
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null
    if (nav && nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true
  } catch {}
  return false
}

// --- Componente Principal ---
interface StoryViewerProps {
  group: StoryGroup
  myId: string
  onClose: () => void
  onStoryUpdated: (storyId: string, patch: Partial<Story>) => void
  onStoryDeleted: (storyId: string) => void
}

export default function StoryViewer({
  group,
  myId,
  onClose,
  onStoryUpdated,
  onStoryDeleted,
}: StoryViewerProps) {
  const { confirm, alert } = useDialog()
  const stories = useMemo(() => (Array.isArray(group.stories) ? group.stories : []), [group.stories])
  const [idx, setIdx] = useState(0)
  const story = stories[idx] || null
  
  // Estados de UI
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  
  const [viewersOpen, setViewersOpen] = useState(false)
  const [viewersLoading, setViewersLoading] = useState(false)
  const [viewersError, setViewersError] = useState('')
  const [viewers, setViewers] = useState<any[]>([])
  const viewersStoryIdRef = useRef<string>('')
  
  const [deleting, setDeleting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [durationMs, setDurationMs] = useState(5000)
  const [muted, setMuted] = useState(true)
  const [videoError, setVideoError] = useState('')
  
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)
  const lastProgressUpdateRef = useRef<number>(0)
  const closeRequestedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const preloadRef = useRef<{ aborts: AbortController[] }>({ aborts: [] })
  const stallRef = useRef<{ lastTime: number; lastTs: number; attempts: number }>({ lastTime: 0, lastTs: 0, attempts: 0 })
  const advanceLockRef = useRef<string>('')

  const name = String(group.displayName || '').trim() || (group.authorId === myId ? 'Você' : 'Amigo')
  const isMine = String(group.authorId || '').trim() === String(myId || '').trim()
  const storyId = story?.id
  const storyViewed = Boolean(story?.viewed)
  const storyMediaUrl = story?.mediaUrl || ''
  const storyMediaKind = (story as any)?.mediaKind
  const storyTrimRaw = (story as any)?.meta?.trim ?? (story as any)?.trim
  const mediaKind = useMemo(() => {
    const k = storyMediaKind
    if (k === 'video' || k === 'image') return k
    return mediaKindFromUrl(storyMediaUrl || null)
  }, [storyMediaKind, storyMediaUrl])
  const isVideo = mediaKind === 'video'
  
  const videoSrc = useMemo(() => {
    const sid = String(storyId || '').trim()
    const direct = String(storyMediaUrl || '').trim()
    if (direct) return direct
    if (!sid) return ''
    return `/api/social/stories/media?storyId=${encodeURIComponent(sid)}`
  }, [storyId, storyMediaUrl])
  const imageSrc = useMemo(() => {
    const sid = String(storyId || '').trim()
    const direct = String(storyMediaUrl || '').trim()
    if (direct) return direct
    if (!sid) return ''
    return `/api/social/stories/media?storyId=${encodeURIComponent(sid)}`
  }, [storyId, storyMediaUrl])
  const isIOS = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
    return isIOSUserAgent(ua)
  }, [])
  const isWebm = useMemo(() => String(videoSrc || '').toLowerCase().includes('.webm'), [videoSrc])
  const needsVideoFallback = isVideo && ((isIOS && isWebm) || !!videoError)
  const trimRange = useMemo(() => {
    const raw = storyTrimRaw
    const start = Number(raw?.start ?? raw?.[0] ?? 0)
    const end = Number(raw?.end ?? raw?.[1] ?? 0)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    return { start, end }
  }, [storyTrimRaw])

  // Marcar como visto
  useEffect(() => {
    if (!storyId || storyViewed) return
    onStoryUpdated(storyId, { viewed: true })
    fetch('/api/social/stories/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyId }),
    }).catch(() => {})
  }, [storyId, storyViewed, onStoryUpdated])

  // Navegação e Timer
  const goNext = useCallback(() => {
    setIdx((v) => {
      const nextIdx = v + 1
      if (nextIdx >= stories.length) {
        if (!closeRequestedRef.current) {
          closeRequestedRef.current = true
          setTimeout(() => onClose(), 0)
        }
        return v
      }
      return nextIdx
    })
  }, [onClose, stories.length])

  useEffect(() => {
    elapsedRef.current = 0
    lastTsRef.current = 0
    setProgress(0)
    setCommentsOpen(false)
    setViewersOpen(false)
    setMuted(true)
    setVideoError('')
    setViewersError('')
    setViewers([])
    viewersStoryIdRef.current = ''
    stallRef.current = { lastTime: 0, lastTs: 0, attempts: 0 }
    advanceLockRef.current = ''
  }, [storyId])

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      const el = videoRef.current
      if (el) {
        el.muted = next
        if (!next) {
          const p = el.play()
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {})
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    closeRequestedRef.current = false
    setDurationMs(isVideo ? (needsVideoFallback ? PHOTO_SECONDS * 1000 : MAX_VIDEO_SECONDS * 1000) : PHOTO_SECONDS * 1000)
  }, [isVideo, needsVideoFallback, storyId])

  useEffect(() => {
    for (const a of preloadRef.current.aborts) {
      try {
        a.abort()
      } catch {}
    }
    preloadRef.current.aborts = []

    const candidates = [stories[idx - 1] || null, stories[idx + 1] || null].filter(Boolean) as any[]
    for (const s of candidates) {
      const url = String(s?.mediaUrl || '').trim()
      if (!url) continue
      const a = new AbortController()
      preloadRef.current.aborts.push(a)
      fetch(url, { headers: { Range: 'bytes=0-0' }, signal: a.signal }).catch(() => {})
    }
  }, [idx, stories])

  // Detectar tab oculta
  useEffect(() => {
    const onVis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Loop de Animação
  useEffect(() => {
    if (!storyId) return
    if (isVideo && !needsVideoFallback) return
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick)
      const paused = holding || commentsOpen || viewersOpen || hidden || deleting
      
      if (!lastTsRef.current) { lastTsRef.current = ts; return }
      const delta = ts - lastTsRef.current
      lastTsRef.current = ts
      if (paused) return
      
      elapsedRef.current += delta
      const next = Math.max(0, Math.min(1, elapsedRef.current / durationMs))
      if (next >= 1) {
        elapsedRef.current = 0
        lastProgressUpdateRef.current = ts
        setProgress(0)
        goNext()
        return
      }
      if (ts - lastProgressUpdateRef.current < 50) return
      lastProgressUpdateRef.current = ts
      setProgress((prev) => (Math.abs(prev - next) < 0.005 ? prev : next))
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [commentsOpen, deleting, durationMs, goNext, hidden, holding, isVideo, storyId, viewersOpen, needsVideoFallback])

  useEffect(() => {
    if (!storyId || !isVideo) return
    const v = videoRef.current
    if (!v) return
    const update = () => {
      const d = Number(v.duration || 0)
      if (!Number.isFinite(d) || d <= 0) return
      const start = Math.max(0, Number(trimRange?.start ?? 0))
      const rawEnd = Number(trimRange?.end ?? d)
      const maxEnd = Math.min(rawEnd, start + MAX_VIDEO_SECONDS)
      const end = Math.max(start + MIN_VIDEO_SECONDS, Math.min(d, maxEnd))
      const ct = Number(v.currentTime || 0)
      if (Number.isFinite(start) && ct < start) {
        try { v.currentTime = start } catch {}
      }
      const effective = Math.max(0.1, end - start)
      const clamped = Math.min(end, Math.max(start, ct))
      const next = Math.max(0, Math.min(1, (clamped - start) / effective))
      setProgress((prev) => (Math.abs(prev - next) < 0.01 ? prev : next))
      if (clamped >= end - 0.05) {
        if (advanceLockRef.current !== String(storyId || '')) {
          advanceLockRef.current = String(storyId || '')
          setProgress(0)
          goNext()
        }
      }
    }
    v.addEventListener('timeupdate', update)
    v.addEventListener('durationchange', update)
    update()
    return () => {
      v.removeEventListener('timeupdate', update)
      v.removeEventListener('durationchange', update)
    }
  }, [isVideo, storyId, goNext, trimRange?.start, trimRange?.end])

  // Controle de Video Play/Pause
  useEffect(() => {
    if (!storyId || !isVideo) return
    const v = videoRef.current
    if (!v) return
    const paused = holding || commentsOpen || viewersOpen || hidden || deleting
    if (paused) v.pause()
    else v.play().catch(() => {})
  }, [commentsOpen, deleting, hidden, holding, isVideo, storyId, viewersOpen])

  useEffect(() => {
    if (!storyId || !isVideo) return
    const v = videoRef.current
    if (!v) return
    let mounted = true
    const timer = window.setInterval(() => {
      if (!mounted) return
      const paused = holding || commentsOpen || viewersOpen || hidden || deleting
      if (paused) {
        stallRef.current.lastTime = Number(v.currentTime || 0)
        stallRef.current.lastTs = Date.now()
        return
      }
      const now = Date.now()
      const current = Number(v.currentTime || 0)
      const last = stallRef.current.lastTime
      const lastTs = stallRef.current.lastTs
      if (!lastTs) {
        stallRef.current.lastTime = current
        stallRef.current.lastTs = now
        return
      }
      if (Math.abs(current - last) < 0.01) {
        if (now - lastTs >= STALL_THRESHOLD_MS) {
          stallRef.current.lastTs = now
          stallRef.current.attempts += 1
          if (stallRef.current.attempts >= 2) {
            setVideoError('Este vídeo não carregou no seu dispositivo.')
            return
          }
          try {
            v.load()
          } catch {}
          try {
            const p = v.play()
            if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {})
          } catch {}
        }
      } else {
        stallRef.current.lastTime = current
        stallRef.current.lastTs = now
      }
    }, STALL_CHECK_MS)
    return () => {
      mounted = false
      try { window.clearInterval(timer) } catch {}
    }
  }, [commentsOpen, deleting, hidden, holding, isVideo, storyId, viewersOpen])

  // Carregar Dados
  const loadComments = async (storyId: string) => {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const res = await fetch(`/api/social/stories/comments?storyId=${encodeURIComponent(storyId)}&limit=200`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setComments(json.data || [])
    } catch (e: any) {
      setCommentsError(e.message)
    } finally {
      setCommentsLoading(false)
    }
  }

  const loadViewers = async (storyId: string) => {
    setViewersLoading(true)
    setViewersError('')
    try {
      const res = await fetch(`/api/social/stories/views?storyId=${encodeURIComponent(storyId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setViewers(json.data || [])
      viewersStoryIdRef.current = storyId
    } catch (e: any) {
      setViewersError(e.message)
    } finally {
      setViewersLoading(false)
    }
  }

  // Ações
  const toggleLike = async () => {
    if (!story?.id) return
    const nextLiked = !story.hasLiked
    onStoryUpdated(story.id, { hasLiked: nextLiked, likeCount: Math.max(0, story.likeCount + (nextLiked ? 1 : -1)) })
    try {
      await fetch('/api/social/stories/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, like: nextLiked }),
      })
    } catch {
      onStoryUpdated(story.id, { hasLiked: story.hasLiked, likeCount: story.likeCount })
    }
  }

  const sendComment = async () => {
    if (!story?.id || !commentText.trim()) return
    const text = commentText.trim()
    setCommentText('')
    try {
      const res = await fetch('/api/social/stories/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, body: text }),
      })
      const json = await res.json()
      if (res.ok) {
        setComments((prev) => [...prev, json.data])
        onStoryUpdated(story.id, { commentCount: story.commentCount + 1 })
      }
    } catch {}
  }

  const handleDelete = async () => {
    if (!story?.id || deleting) return
    const ok = await confirm('Tem certeza que deseja deletar este story?\nEssa ação é irreversível.', 'Deletar story', { confirmText: 'Deletar', cancelText: 'Cancelar' })
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch('/api/social/stories/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      if (res.ok) {
        onStoryDeleted(story.id)
        onClose()
      }
    } catch {
      alert('Erro ao deletar story.')
    } finally {
      setDeleting(false)
    }
  }

  if (!story) return null
  const viewCount = viewersStoryIdRef.current === story.id ? viewers.length : 0

  return (
    <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center">
      <div className="absolute inset-0" onClick={deleting ? undefined : onClose} />

      <div
        className="relative w-full max-w-md h-[92vh] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
      >
        {/* Header / Barra de Progresso */}
        <div className="absolute top-0 left-0 right-0 p-3 z-20 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex gap-1 mb-2">
            {stories.map((s, i) => (
              <div key={s.id} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-white/90 transition-all duration-100 ease-linear"
                  style={{ width: `${Math.round((i < idx ? 1 : i === idx ? progress : 0) * 100)}%` }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-900 border border-neutral-800">
              {group.photoUrl ? (
                <Image src={group.photoUrl} alt={name} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-yellow-500 font-black">{initials(name)}</div>
              )}
            </div>
            <div className="min-w-0 flex-1 drop-shadow-md">
              <div className="text-sm text-white font-black truncate">{name}</div>
              <div className="text-[11px] text-neutral-300 font-bold">{formatAgo(story.createdAt)}</div>
            </div>
            {isMine && (
              <button onClick={handleDelete} className="w-10 h-10 rounded-xl bg-black/40 text-red-400 flex items-center justify-center hover:bg-black/60">
                {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              </button>
            )}
            {isVideo && (
              <button
                onClick={toggleMuted}
                className="w-10 h-10 rounded-xl bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                aria-label={muted ? 'Ativar som' : 'Desativar som'}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <AnimatePresence mode="wait">
            <motion.div
              key={String(story.id || idx)}
              initial={{ opacity: 0.2 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {story.mediaUrl ? (
                isVideo ? (
                  <>
                    {!((isIOS && isWebm) || videoError) ? (
                      <video
                        ref={videoRef}
                        src={videoSrc}
                        className="w-full h-full object-contain"
                        playsInline
                        muted={muted}
                        autoPlay
                        preload="metadata"
                        onLoadedMetadata={(e) => {
                          const d = Number((e.currentTarget as any)?.duration || 0)
                          const start = Math.max(0, Number(trimRange?.start ?? 0))
                          const rawEnd = Number(trimRange?.end ?? d)
                          const maxEnd = Math.min(rawEnd, start + MAX_VIDEO_SECONDS)
                          const end = Math.max(start + MIN_VIDEO_SECONDS, Math.min(d, maxEnd))
                          if (d > 0) setDurationMs(Math.max(MIN_VIDEO_SECONDS * 1000, Math.min(MAX_VIDEO_SECONDS * 1000, (end - start) * 1000)))
                          try { if (Number.isFinite(start) && start > 0) e.currentTarget.currentTime = start } catch {}
                        }}
                        onEnded={() => {
                          if (advanceLockRef.current !== String(story?.id || '')) {
                            advanceLockRef.current = String(story?.id || '')
                            setProgress(0)
                            goNext()
                          }
                        }}
                        onError={() => setVideoError('Não foi possível reproduzir este vídeo.')}
                        onStalled={() => setVideoError('Este vídeo não carregou no seu dispositivo.')}
                      />
                    ) : (
                      <div className="px-6 text-center">
                        <div className="text-white font-black text-lg">Story indisponível</div>
                        <div className="mt-2 text-sm text-neutral-300 font-semibold">
                          {videoError || (isIOS && isWebm ? 'Este story foi publicado em WEBM e pode não funcionar no iPhone.' : 'Não foi possível carregar o vídeo.')}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setProgress(0); goNext(); }}
                          className="mt-4 min-h-[44px] px-5 rounded-2xl bg-yellow-500 text-black font-black uppercase tracking-widest"
                        >
                          Próximo
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <Image src={imageSrc} alt="Story" fill className="object-contain" sizes="(max-width: 768px) 100vw, 420px" priority unoptimized />
                )
              ) : (
                <div className="text-neutral-500 font-bold">Mídia indisponível</div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Áreas de Toque para Navegação */}
        <button className="absolute left-0 top-20 bottom-20 w-1/3 z-10" onClick={() => setIdx((v) => Math.max(0, v - 1))} aria-label="Anterior" />
        <button className="absolute right-0 top-20 bottom-20 w-1/3 z-10" onClick={() => setIdx((v) => Math.min(stories.length - 1, v + 1))} aria-label="Próximo" />

        {/* Footer / Controles */}
        <div className="absolute bottom-0 left-0 right-0 p-3 z-20 bg-gradient-to-t from-black/90 to-transparent pt-12">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isMine && (
                <div className="flex flex-col items-center">
                  <button onClick={() => { setViewersOpen(!viewersOpen); setCommentsOpen(false); if (!viewersOpen) loadViewers(story.id) }} className="w-12 h-12 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-white flex items-center justify-center">
                    <Eye size={20} />
                  </button>
                  <span className="text-[10px] font-bold text-white drop-shadow">{viewCount}</span>
                </div>
              )}
              
              <div className="flex flex-col items-center">
                <button onClick={toggleLike} className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${story.hasLiked ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-neutral-900/80 border-neutral-800 text-white'}`}>
                  <Heart size={20} className={story.hasLiked ? 'fill-current' : ''} />
                </button>
                <span className="text-[10px] font-bold text-white drop-shadow">{story.likeCount}</span>
              </div>

              <div className="flex flex-col items-center">
                <button onClick={() => { setCommentsOpen(!commentsOpen); setViewersOpen(false); if (!commentsOpen) loadComments(story.id) }} className="w-12 h-12 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-white flex items-center justify-center">
                  <MessageCircle size={20} />
                </button>
                <span className="text-[10px] font-bold text-white drop-shadow">{story.commentCount}</span>
              </div>
            </div>
          </div>

          {/* Modal de Comentários / Views */}
          {(commentsOpen || viewersOpen) && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-3 bg-neutral-900/95 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="max-h-[30vh] overflow-y-auto custom-scrollbar p-3 space-y-3">
                {viewersOpen && viewers.map((v) => (
                   <div key={v.viewerId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 overflow-hidden">
                        {v.photoUrl ? <Image src={v.photoUrl} width={32} height={32} alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs text-yellow-500">{initials(v.displayName)}</div>}
                      </div>
                      <span className="text-xs font-bold text-white flex-1">{v.displayName || 'Usuário'}</span>
                      <span className="text-[10px] text-neutral-400">{formatAgo(v.viewedAt)}</span>
                   </div>
                ))}
                {commentsOpen && comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 overflow-hidden shrink-0">
                      {c.user?.photoUrl ? <Image src={c.user.photoUrl} width={32} height={32} alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs text-yellow-500">{initials(c.user?.displayName || '')}</div>}
                    </div>
                    <div>
                      <div className="text-xs font-black text-white">{c.user?.displayName || 'Usuário'}</div>
                      <div className="text-xs text-neutral-300">{c.body}</div>
                    </div>
                  </div>
                ))}
                {((viewersOpen && !viewers.length && !viewersLoading) || (commentsOpen && !comments.length && !commentsLoading)) && (
                  <div className="text-center text-xs text-neutral-500 py-2">Nada por aqui ainda.</div>
                )}
              </div>
              
              {commentsOpen && (
                <div className="p-2 border-t border-neutral-800 flex gap-2">
                  <input value={commentText} onChange={e => setCommentText(e.target.value)} className="flex-1 bg-black/40 border border-neutral-700 rounded-xl px-3 text-xs text-white" placeholder="Escreva..." />
                  <button onClick={sendComment} className="px-3 py-2 bg-yellow-500 rounded-xl text-black text-xs font-black">Enviar</button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
