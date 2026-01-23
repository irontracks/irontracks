'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Eye } from 'lucide-react'
import { motion } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useDialog } from '@/contexts/DialogContext'

type Story = {
  id: string
  createdAt: string
  expiresAt: string
  caption: string | null
  mediaUrl: string | null
  viewed: boolean
  likeCount: number
  hasLiked: boolean
  commentCount: number
}

type StoryGroup = {
  authorId: string
  displayName: string | null
  photoUrl: string | null
  role: string | null
  hasStories?: boolean
  hasUnseen?: boolean
  stories: Story[]
}

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

export default function StoriesBar({ currentUserId }: { currentUserId?: string }) {
  const myId = typeof currentUserId === 'string' ? currentUserId : ''
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [openAuthorId, setOpenAuthorId] = useState<string>('')
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/social/stories/list', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao carregar stories'))
      const arr = Array.isArray(json?.data) ? (json.data as StoryGroup[]) : []
      setGroups(arr)
    } catch (e: any) {
      setError(String(e?.message || e))
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  const uploadStory = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const uid = String(authData?.user?.id || '').trim()
      if (!uid) throw new Error('unauthorized')

      const rawName = String(file?.name || '').trim().toLowerCase()
      const ext = rawName.endsWith('.png') ? '.png' : rawName.endsWith('.jpeg') ? '.jpeg' : rawName.endsWith('.jpg') ? '.jpg' : '.jpg'
      const storyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      const path = `${uid}/stories/${storyId}${ext}`

      const signResp = await fetch('/api/storage/social-stories/signed-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const signJson = await signResp.json().catch(() => null)
      if (!signResp.ok || !signJson?.ok || !signJson?.token) throw new Error(String(signJson?.error || 'Falha ao preparar upload'))

      const { error: upErr } = await supabase.storage
        .from('social-stories')
        .uploadToSignedUrl(path, String(signJson.token), file, { contentType: file.type || 'image/jpeg' })
      if (upErr) throw upErr

      const createResp = await fetch('/api/social/stories/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mediaPath: path, caption: null, meta: { source: 'upload' } }),
      })
      const createJson = await createResp.json().catch(() => null)
      if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))

      await reload()
    } catch (e: any) {
      const msg = String(e?.message || e)
      setError(msg === 'unauthorized' ? 'Faça login novamente para publicar.' : 'Não foi possível publicar seu story.')
    } finally {
      setUploading(false)
      try {
        if (uploadRef.current) uploadRef.current.value = ''
      } catch {}
    }
  }

  useEffect(() => {
    reload()
    const onRefresh = () => reload()
    try {
      window.addEventListener('irontracks:stories:refresh', onRefresh as any)
    } catch {}
    return () => {
      try {
        window.removeEventListener('irontracks:stories:refresh', onRefresh as any)
      } catch {}
    }
  }, [reload])

  const ordered = useMemo(() => {
    const arr = Array.isArray(groups) ? groups : []
    if (!myId) return arr
    const mine = arr.find((g) => g.authorId === myId)
    if (!mine) return arr
    return [mine, ...arr.filter((g) => g.authorId !== myId)]
  }, [groups, myId])

  const currentGroup = useMemo(() => ordered.find((g) => g.authorId === openAuthorId) || null, [ordered, openAuthorId])
  const closeViewer = useCallback(() => setOpen(false), [])
  const handleStoryUpdated = useCallback(
    (storyId: string, patch: Partial<Story>) => {
      const authorId = openAuthorId
      if (!authorId) return
      setGroups((prev) =>
        prev.map((g) => {
          if (g.authorId !== authorId) return g
          const nextStories = (Array.isArray(g.stories) ? g.stories : []).map((st) => (st.id === storyId ? { ...st, ...patch } : st))
          const hasUnseen = nextStories.some((st) => !st.viewed)
          return { ...g, stories: nextStories, hasUnseen }
        })
      )
    },
    [openAuthorId]
  )
  const handleStoryDeleted = useCallback(
    (storyId: string) => {
      const authorId = openAuthorId
      if (!authorId) return
      setGroups((prev) =>
        prev.map((g) => {
          if (g.authorId !== authorId) return g
          const nextStories = (Array.isArray(g.stories) ? g.stories : []).filter((st) => st.id !== storyId)
          const hasUnseen = nextStories.some((st) => !st.viewed)
          return { ...g, stories: nextStories, hasUnseen }
        })
      )
    },
    [openAuthorId]
  )

  return (
    <div className="mb-4">
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
          if (!f) return
          if (!String(f.type || '').toLowerCase().startsWith('image/')) {
            setError('Selecione uma imagem.')
            return
          }
          if (f.size > 12 * 1024 * 1024) {
            setError('Imagem muito grande (máx 12MB).')
            return
          }
          uploadStory(f)
        }}
      />
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Stories</div>
        <button
          type="button"
          onClick={reload}
          className="text-[11px] font-black text-neutral-400 hover:text-white"
          disabled={loading || uploading}
        >
          {loading ? 'Carregando…' : uploading ? 'Publicando…' : 'Atualizar'}
        </button>
      </div>

      {error ? (
        <div className="mt-2 bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-red-300 font-bold">
          {error}
        </div>
      ) : null}

      <div className="mt-2 flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {!ordered.length && loading ? (
          <>
            <div className="shrink-0 w-[72px]">
              <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 mx-auto" />
              <div className="mt-1 h-3 w-12 bg-neutral-900 border border-neutral-800 rounded-md mx-auto" />
            </div>
            <div className="shrink-0 w-[72px]">
              <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 mx-auto" />
              <div className="mt-1 h-3 w-12 bg-neutral-900 border border-neutral-800 rounded-md mx-auto" />
            </div>
            <div className="shrink-0 w-[72px]">
              <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 mx-auto" />
              <div className="mt-1 h-3 w-12 bg-neutral-900 border border-neutral-800 rounded-md mx-auto" />
            </div>
          </>
        ) : null}
        {ordered.map((g) => {
          const hasStories = Array.isArray(g.stories) && g.stories.length > 0
          const hasUnseen = !!g.hasUnseen
          const ringCls = !hasStories
            ? 'border-transparent'
            : hasUnseen
              ? 'border-red-500'
              : 'border-neutral-400/60'

          const name = String(g.displayName || '').trim() || (g.authorId === myId ? 'Você' : 'Amigo')
          return (
            <button
              key={g.authorId}
              type="button"
              onClick={() => {
                if (g.authorId === myId && !hasStories) {
                  if (!uploading && uploadRef.current) uploadRef.current.click()
                  return
                }
                if (!hasStories) return
                setOpenAuthorId(g.authorId)
                setOpen(true)
              }}
              className="shrink-0 w-[72px] focus:outline-none"
              aria-label={hasStories ? `Abrir stories de ${name}` : `Sem stories de ${name}`}
            >
              <div className={`w-16 h-16 rounded-full border-2 ${ringCls} p-1 mx-auto relative`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  {g.photoUrl ? (
                    <Image src={g.photoUrl} alt={name} width={64} height={64} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-yellow-500 font-black">{initials(name)}</span>
                  )}
                </div>

                {g.authorId === myId && !hasStories ? (
                  <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-yellow-500 border-2 border-black flex items-center justify-center">
                    <Plus size={14} className="text-black" />
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-[11px] text-neutral-300 font-bold truncate text-center">{name}</div>
            </button>
          )
        })}
      </div>

      {ordered.length === 0 && !loading && !error ? (
        <div className="mt-2 px-1 text-[11px] text-neutral-400 font-bold">
          Stories ainda não carregaram. Toque em <span className="text-neutral-200">Atualizar</span>.
        </div>
      ) : null}

      {ordered.length > 0 && ordered.every((g) => !Array.isArray(g.stories) || g.stories.length === 0) && !error ? (
        <div className="mt-2 px-1 text-[11px] text-neutral-400 font-bold">
          Sem stories por enquanto. Para postar: abra a <span className="text-neutral-200">Foto</span> no relatório do treino e toque em{' '}
          <span className="text-neutral-200">Postar no IronTracks (24h)</span> ou clique no <span className="text-neutral-200">+</span> do seu avatar.
        </div>
      ) : null}

      {open && currentGroup ? (
        <StoryViewer
          group={currentGroup}
          myId={myId}
          onClose={closeViewer}
          onStoryUpdated={handleStoryUpdated}
          onStoryDeleted={handleStoryDeleted}
        />
      ) : null}
    </div>
  )
}

function StoryViewer({
  group,
  myId,
  onClose,
  onStoryUpdated,
  onStoryDeleted,
}: {
  group: StoryGroup
  myId: string
  onClose: () => void
  onStoryUpdated: (storyId: string, patch: Partial<Story>) => void
  onStoryDeleted: (storyId: string) => void
}) {
  const { confirm, alert } = useDialog()
  const stories = Array.isArray(group.stories) ? group.stories : []
  const [idx, setIdx] = useState(0)
  const story = stories[idx] || null
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
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)
  const closeRequestedRef = useRef(false)

  const name = String(group.displayName || '').trim() || (group.authorId === myId ? 'Você' : 'Amigo')
  const isMine = String(group.authorId || '').trim() && String(group.authorId || '').trim() === String(myId || '').trim()
  const durationMs = 5000

  const markViewed = async (storyId: string) => {
    try {
      await fetch('/api/social/stories/view', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
    } catch {}
  }

  useEffect(() => {
    if (!story?.id) return
    if (story.viewed) return
    onStoryUpdated(story.id, { viewed: true })
    markViewed(story.id)
  }, [story?.id, story?.viewed, onStoryUpdated])

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
    try {
      if (typeof document !== 'undefined') setHidden(Boolean(document.hidden))
    } catch {}
    const onVis = () => {
      try {
        if (typeof document !== 'undefined') setHidden(Boolean(document.hidden))
      } catch {}
    }
    try {
      document.addEventListener('visibilitychange', onVis)
    } catch {}
    return () => {
      try {
        document.removeEventListener('visibilitychange', onVis)
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!story?.id) return

    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick)
      const paused = holding || commentsOpen || viewersOpen || hidden || deleting
      if (!lastTsRef.current) {
        lastTsRef.current = ts
        return
      }
      const delta = ts - lastTsRef.current
      lastTsRef.current = ts
      if (paused) return
      elapsedRef.current += delta
      const next = Math.max(0, Math.min(1, elapsedRef.current / durationMs))
      setProgress((prev) => (Math.abs(prev - next) < 0.005 ? prev : next))
      if (next >= 1) {
        elapsedRef.current = 0
        setProgress(0)
        setIdx((v) => {
          const nextIdx = v + 1
          if (nextIdx >= stories.length) {
            if (!closeRequestedRef.current) {
              closeRequestedRef.current = true
              try {
                window.setTimeout(() => {
                  try {
                    onClose()
                  } catch {}
                }, 0)
              } catch {}
            }
            return v
          }
          return nextIdx
        })
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      } catch {}
      rafRef.current = null
    }
  }, [commentsOpen, deleting, hidden, holding, onClose, stories.length, story?.id, viewersOpen])

  const loadComments = async (storyId: string) => {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const res = await fetch(`/api/social/stories/comments?storyId=${encodeURIComponent(storyId)}&limit=200`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao carregar comentários'))
      setComments(Array.isArray(json?.data) ? json.data : [])
    } catch (e: any) {
      setCommentsError(String(e?.message || e))
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }

  const loadViewers = async (storyId: string) => {
    const sid = String(storyId || '').trim()
    if (!sid) return
    setViewersLoading(true)
    setViewersError('')
    try {
      const res = await fetch(`/api/social/stories/views?storyId=${encodeURIComponent(sid)}`, { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao carregar visualizações'))
      const arr = Array.isArray(json?.data) ? json.data : []
      viewersStoryIdRef.current = sid
      setViewers(arr)
    } catch (e: any) {
      setViewersError(String(e?.message || e))
      setViewers([])
    } finally {
      setViewersLoading(false)
    }
  }

  const toggleLike = async () => {
    if (!story?.id) return
    const nextLiked = !story.hasLiked
    onStoryUpdated(story.id, { hasLiked: nextLiked, likeCount: Math.max(0, story.likeCount + (nextLiked ? 1 : -1)) })
    try {
      const res = await fetch('/api/social/stories/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, like: nextLiked }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao curtir'))
    } catch {
      onStoryUpdated(story.id, { hasLiked: story.hasLiked, likeCount: story.likeCount })
    }
  }

  const sendComment = async () => {
    if (!story?.id) return
    const text = String(commentText || '').trim()
    if (!text) return
    setCommentText('')
    try {
      const res = await fetch('/api/social/stories/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, body: text }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao comentar'))
      setComments((prev) => [...prev, json.data])
      onStoryUpdated(story.id, { commentCount: story.commentCount + 1 })
    } catch {}
  }

  if (!story) return null
  const viewCount = viewersStoryIdRef.current === story.id ? viewers.length : 0

  return (
    <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center">
      <div className="absolute inset-0" onClick={deleting ? undefined : onClose} />

      <div
        className="relative w-full max-w-md h-[92vh] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
      >
        <div className="absolute top-0 left-0 right-0 p-3 z-20">
          <div className="flex gap-1 mb-2">
            {stories.map((s, i) => (
              <div key={s.id} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-white/90"
                  style={{
                    width: `${Math.round((i < idx ? 1 : i === idx ? progress : 0) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              {group.photoUrl ? (
                <Image src={group.photoUrl} alt={name} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <span className="text-yellow-500 font-black">{initials(name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white font-black truncate">{name}</div>
              <div className="text-[11px] text-neutral-400 font-bold">{formatAgo(story.createdAt)}</div>
            </div>
            {isMine ? (
              <button
                type="button"
                onClick={async () => {
                  if (!story?.id || deleting) return
                  const ok = await confirm(
                    'Tem certeza que deseja deletar este story?\nEssa ação não pode ser desfeita.',
                    'Deletar story',
                    { confirmText: 'Deletar', cancelText: 'Cancelar' }
                  )
                  if (!ok) return
                  setDeleting(true)
                  try {
                    const res = await fetch('/api/social/stories/delete', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ storyId: story.id }),
                    })
                    const json = await res.json().catch(() => null)
                    if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao deletar'))
                    onStoryDeleted(story.id)
                    try {
                      window.dispatchEvent(new Event('irontracks:stories:refresh'))
                    } catch {}
                    onClose()
                  } catch (e: any) {
                    await alert(String(e?.message || 'Não foi possível deletar agora. Tente novamente.'), 'Erro')
                  } finally {
                    setDeleting(false)
                  }
                }}
                className="w-10 h-10 rounded-xl bg-neutral-900/60 border border-neutral-800 text-red-200 hover:bg-neutral-900 flex items-center justify-center disabled:opacity-60"
                aria-label="Deletar story"
                disabled={deleting}
              >
                {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={deleting ? undefined : onClose}
              className="w-10 h-10 rounded-xl bg-neutral-900/60 border border-neutral-800 text-neutral-200 hover:bg-neutral-900 flex items-center justify-center"
              aria-label="Fechar"
              disabled={deleting}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          {story.mediaUrl ? (
            <Image src={story.mediaUrl} alt="Story" fill className="object-contain" sizes="(max-width: 768px) 100vw, 420px" />
          ) : (
            <div className="text-neutral-400 font-bold">Mídia indisponível</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
          className="absolute left-0 top-0 bottom-0 w-1/4 z-10"
          aria-label="Anterior"
          disabled={deleting}
        />
        <button
          type="button"
          onClick={() => setIdx((v) => Math.min(stories.length - 1, v + 1))}
          className="absolute right-0 top-0 bottom-0 w-1/4 z-10"
          aria-label="Próximo"
          disabled={deleting}
        />

        <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isMine ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !viewersOpen
                      setViewersOpen(next)
                      setCommentsOpen(false)
                      if (next && story?.id) loadViewers(story.id)
                    }}
                    className="w-12 h-12 rounded-2xl bg-neutral-900/70 border border-neutral-800 text-neutral-200 inline-flex items-center justify-center"
                    aria-label="Visualizações"
                    disabled={deleting}
                  >
                    <Eye size={18} />
                  </button>
                  <div className="text-xs text-neutral-300 font-bold tabular-nums">{viewCount}</div>
                </>
              ) : null}
              <button
                type="button"
                onClick={toggleLike}
                className={`w-12 h-12 rounded-2xl border font-black inline-flex items-center justify-center ${
                  story.hasLiked ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-neutral-900/70 border-neutral-800 text-neutral-200'
                }`}
                aria-label="Curtir"
                disabled={deleting}
              >
                <Heart size={18} className={story.hasLiked ? 'fill-current' : ''} />
              </button>
              <div className="text-xs text-neutral-300 font-bold tabular-nums">{story.likeCount}</div>

              <button
                type="button"
                onClick={() => {
                  const next = !commentsOpen
                  setCommentsOpen(next)
                  setViewersOpen(false)
                  if (next && story?.id) loadComments(story.id)
                }}
                className="w-12 h-12 rounded-2xl bg-neutral-900/70 border border-neutral-800 text-neutral-200 inline-flex items-center justify-center"
                aria-label="Comentários"
                disabled={deleting}
              >
                <MessageCircle size={18} />
              </button>
              <div className="text-xs text-neutral-300 font-bold tabular-nums">{story.commentCount}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIdx((v) => Math.max(0, v - 1))}
                className="w-10 h-10 rounded-xl bg-neutral-900/70 border border-neutral-800 text-neutral-200 inline-flex items-center justify-center"
                aria-label="Story anterior"
                disabled={idx === 0 || deleting}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setIdx((v) => Math.min(stories.length - 1, v + 1))}
                className="w-10 h-10 rounded-xl bg-neutral-900/70 border border-neutral-800 text-neutral-200 inline-flex items-center justify-center"
                aria-label="Próximo story"
                disabled={idx === stories.length - 1 || deleting}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {viewersOpen ? (
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-3 bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-200 font-black">
                  Visualizações{viewCount ? ` (${viewCount})` : ''}
                </div>
                <button
                  type="button"
                  onClick={() => setViewersOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900"
                >
                  Fechar
                </button>
              </div>
              <div className="max-h-[34vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
                {viewersLoading ? <div className="text-xs text-neutral-400 font-bold">Carregando…</div> : null}
                {viewersError ? <div className="text-xs text-red-300 font-bold">{viewersError}</div> : null}
                {!viewersLoading && !viewersError && viewers.length === 0 ? (
                  <div className="text-xs text-neutral-400 font-bold">Ainda sem visualizações.</div>
                ) : null}
                {viewers.map((v) => {
                  const vid = String(v?.viewerId || '').trim()
                  const uname = String(v?.displayName || '').trim() || 'Usuário'
                  const photo = String(v?.photoUrl || '').trim()
                  const when = v?.viewedAt ? formatAgo(String(v.viewedAt)) : ''
                  return (
                    <div key={vid || uname} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0">
                        {photo ? (
                          <Image src={photo} alt={uname} width={36} height={36} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-yellow-500 font-black text-xs">{initials(uname)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-neutral-200 font-black truncate">{uname}</div>
                      </div>
                      <div className="text-[11px] text-neutral-400 font-bold tabular-nums">{when}</div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ) : null}

          {commentsOpen ? (
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-3 bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden"
            >
              <div className="max-h-[34vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
                {commentsLoading ? <div className="text-xs text-neutral-400 font-bold">Carregando…</div> : null}
                {commentsError ? <div className="text-xs text-red-300 font-bold">{commentsError}</div> : null}
                {!commentsLoading && !commentsError && comments.length === 0 ? (
                  <div className="text-xs text-neutral-400 font-bold">Seja o primeiro a comentar.</div>
                ) : null}
                {comments.map((c) => {
                  const u = c?.user || {}
                  const uname = String(u?.displayName || '').trim() || 'Usuário'
                  return (
                    <div key={String(c?.id)} className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0">
                        {u?.photoUrl ? (
                          <Image src={u.photoUrl} alt={uname} width={32} height={32} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-yellow-500 font-black text-xs">{initials(uname)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-neutral-300 font-black">{uname}</div>
                        <div className="text-xs text-neutral-200 font-bold whitespace-pre-wrap break-words">{String(c?.body || '')}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-3 border-t border-neutral-800 flex items-center gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendComment()
                  }}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-sm text-white font-bold outline-none focus:border-yellow-500/40"
                  placeholder="Comente…"
                />
                <button
                  type="button"
                  onClick={sendComment}
                  className="px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
                >
                  Enviar
                </button>
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
