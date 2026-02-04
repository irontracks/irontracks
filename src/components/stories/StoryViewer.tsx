'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight, Eye, Trash2, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useDialog } from '@/contexts/DialogContext'
import { Story, StoryGroup } from '@/types/social'
import { mediaKindFromUrl } from '@/utils/mediaUtils'

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
  const stories = Array.isArray(group.stories) ? group.stories : []
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
  
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)
  const closeRequestedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const name = String(group.displayName || '').trim() || (group.authorId === myId ? 'Você' : 'Amigo')
  const isMine = String(group.authorId || '').trim() === String(myId || '').trim()
  const mediaKind = useMemo(() => mediaKindFromUrl(story?.mediaUrl || null), [story?.mediaUrl])
  const isVideo = mediaKind === 'video'
  
  const videoSrc = useMemo(() => {
    const sid = String(story?.id || '').trim()
    if (!sid) return String(story?.mediaUrl || '')
    // Usar rota de proxy para evitar CORS/Issues de vídeo se necessário, ou URL direta
    // Como o projeto usa Supabase Storage público, URL direta costuma funcionar.
    // Mas o código original usava /api/social/stories/media, vamos manter para compatibilidade.
    return `/api/social/stories/media?storyId=${encodeURIComponent(sid)}`
  }, [story?.id, story?.mediaUrl])

  // Marcar como visto
  useEffect(() => {
    if (!story?.id || story.viewed) return
    onStoryUpdated(story.id, { viewed: true })
    fetch('/api/social/stories/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyId: story.id }),
    }).catch(() => {})
  }, [story?.id, story?.viewed, onStoryUpdated])

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
    setViewersError('')
    setViewers([])
    viewersStoryIdRef.current = ''
  }, [story?.id])

  useEffect(() => {
    closeRequestedRef.current = false
    setDurationMs(isVideo ? 15000 : 5000)
  }, [isVideo, story?.id])

  // Detectar tab oculta
  useEffect(() => {
    const onVis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Loop de Animação
  useEffect(() => {
    if (!story?.id) return
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick)
      const paused = holding || commentsOpen || viewersOpen || hidden || deleting
      
      if (isVideo) {
        const v = videoRef.current
        const d = Number(v?.duration || 0)
        if (!v || !Number.isFinite(d) || d <= 0) return
        if (paused) return
        const next = Math.max(0, Math.min(1, Number(v.currentTime || 0) / d))
        setProgress((prev) => (Math.abs(prev - next) < 0.005 ? prev : next))
        return
      }

      if (!lastTsRef.current) { lastTsRef.current = ts; return }
      const delta = ts - lastTsRef.current
      lastTsRef.current = ts
      if (paused) return
      
      elapsedRef.current += delta
      const next = Math.max(0, Math.min(1, elapsedRef.current / durationMs))
      setProgress((prev) => (Math.abs(prev - next) < 0.005 ? prev : next))
      if (next >= 1) {
        elapsedRef.current = 0
        setProgress(0)
        goNext()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [commentsOpen, deleting, durationMs, goNext, hidden, holding, isVideo, story?.id, viewersOpen])

  // Controle de Video Play/Pause
  useEffect(() => {
    if (!story?.id || !isVideo) return
    const v = videoRef.current
    if (!v) return
    const paused = holding || commentsOpen || viewersOpen || hidden || deleting
    if (paused) v.pause()
    else v.play().catch(() => {})
  }, [commentsOpen, deleting, hidden, holding, isVideo, story?.id, viewersOpen])

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
    const ok = await confirm('Tem certeza que deseja deletar este story?', 'Deletar story', { confirmText: 'Deletar', cancelText: 'Cancelar' })
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
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mídia Principal */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {story.mediaUrl ? (
            isVideo ? (
              <video
                ref={videoRef}
                src={videoSrc}
                className="w-full h-full object-contain"
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(e) => {
                  const d = Number((e.currentTarget as any)?.duration || 0)
                  if (d > 0) setDurationMs(Math.max(3000, Math.min(30000, d * 1000)))
                }}
                onEnded={() => { setProgress(0); goNext(); }}
              />
            ) : (
              <Image src={story.mediaUrl} alt="Story" fill className="object-contain" sizes="(max-width: 768px) 100vw, 420px" priority />
            )
          ) : (
            <div className="text-neutral-500 font-bold">Mídia indisponível</div>
          )}
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
