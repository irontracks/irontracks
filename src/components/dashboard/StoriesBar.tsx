'use client'
import dynamic from 'next/dynamic'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
const StoryViewer = dynamic(() => import('@/components/stories/StoryViewer'), { ssr: false })
const StoryCreatorModal = dynamic(() => import('@/components/stories/StoryCreatorModal'), { ssr: false })
import { Story, StoryGroup } from '@/types/social'
import { getErrorMessage } from '@/utils/errorMessage'
import { isIosNative } from '@/utils/platform'
import { logError } from '@/lib/logger'
import { uploadStoryFile } from '@/utils/storage/mediaUpload'

const initials = (name: string) => {
  const n = String(name || '').trim()
  if (!n) return '?'
  return n.slice(0, 1).toUpperCase()
}

export default function StoriesBar({
  currentUserId,
  onMyStoryStateChange,
  onAddStory: externalAddStory,
}: {
  currentUserId?: string
  /** Called whenever user's own story state changes: (hasActiveStory) */
  onMyStoryStateChange?: (hasActiveStory: boolean) => void
  /** Triggered from outside (e.g. header long-press) to open story creator */
  onAddStory?: () => void
}) {
  const myId = typeof currentUserId === 'string' ? currentUserId : ''
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [openAuthorId, setOpenAuthorId] = useState<string>('')
  const [isCreatorOpen, setIsCreatorOpen] = useState(false)



  const reload = useCallback(async (skipCache = false) => {
    setLoading(true)
    setError('')
    try {
      const url = skipCache ? '/api/social/stories/list?nocache=1' : '/api/social/stories/list'
      const res = await fetch(url, { method: 'GET' })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || 'Falha ao carregar stories'))
      const arr = Array.isArray(json?.data) ? (json.data as StoryGroup[]) : []
      setGroups(arr)
    } catch (e: unknown) {
      setError(String(getErrorMessage(e) || e))
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Notify parent when our own story state changes
  const prevMyStoryActive = useRef<boolean | null>(null)
  useEffect(() => {
    if (!myId || !onMyStoryStateChange) return
    const mine = groups.find((g) => g.authorId === myId)
    const hasActive = !!(mine && Array.isArray(mine.stories) && mine.stories.length > 0)
    if (prevMyStoryActive.current !== hasActive) {
      prevMyStoryActive.current = hasActive
      onMyStoryStateChange(hasActive)
    }
  }, [groups, myId, onMyStoryStateChange])



  // Listen for the window event dispatched by the header long-press
  useEffect(() => {
    const handler = () => setIsCreatorOpen(true)
    try { window.addEventListener('irontracks:stories:open-creator', handler) } catch { }
    return () => {
      try { window.removeEventListener('irontracks:stories:open-creator', handler) } catch { }
    }
  }, [])

  const prevCreatorOpenRef = useRef(false)

  // Auto-reload when StoryCreatorModal closes (covers iOS where reload() during
  // open modal doesn't update the DOM behind the overlay)
  useEffect(() => {
    const wasOpen = prevCreatorOpenRef.current
    prevCreatorOpenRef.current = isCreatorOpen
    if (wasOpen && !isCreatorOpen) {
      // Modal just closed — give CDN/Cloudinary 2s to propagate then reload (skip cache)
      const t = setTimeout(() => reload(true), 2000)
      return () => clearTimeout(t)
    }
  }, [isCreatorOpen, reload])

  const uploadStory = async (file: File, metadata: Record<string, unknown> = {}) => {
    setUploading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const uid = String(authData?.user?.id || '').trim()
      if (!uid) throw new Error('unauthorized')

      const MAX_BYTES = 200 * 1024 * 1024
      if (file?.size && file.size > MAX_BYTES) {
        throw new Error(`Vídeo muito grande (máx 200MB). Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      }

      // uploadStoryFile handles provider selection (Cloudinary or Supabase signed URL)
      // and returns either a full Cloudinary URL or a Supabase relative path
      const mediaPath = await uploadStoryFile(file, uid)

      const createUrl = isIosNative()
        ? `/api/social/stories/create?media_path=${encodeURIComponent(mediaPath)}`
        : '/api/social/stories/create'
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mediaPath,
          media_path: mediaPath,
          caption: null,
          meta: { source: 'upload', ...metadata },
        }),
      })
      const createJson = await createResp.json().catch((): null => null)
      if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))

      // Small delay for Cloudinary CDN propagation before refreshing the list
      await new Promise((r) => setTimeout(r, 1500))
      await reload(true)
    } catch (e: unknown) {
      const msg = String(getErrorMessage(e) || e)
      logError('error', 'Story upload error:', e)
      const low = msg.toLowerCase()
      if (low.includes('exceeded') && low.includes('maximum') && low.includes('size')) {
        setError('O arquivo é muito grande para enviar. Reduza o tamanho do vídeo e tente novamente.')
        return
      }
      setError(msg === 'unauthorized' ? 'Faça login novamente para publicar.' : 'Não foi possível publicar o story. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    // Initial load — only if empty to avoid unnecessary fetches on tab switches
    if (groups.length === 0) {
      reload()
    }
    // Fast-path: local window event dispatched by StoryComposer after post
    const onRefresh = () => reload()
    try {
      window.addEventListener('irontracks:stories:refresh', onRefresh as EventListenerOrEventListenerObject)
    } catch { }

    // Reliable path: Supabase Realtime subscription on the stories table.
    // This handles the iOS native case where window events don't cross component
    // boundaries after tab switches or component remounts.
    const supabase = createClient()
    const channel = supabase
      .channel('stories-auto-refresh')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_stories' }, () => {
        // Debounce slightly so CDN/Cloudinary has time to propagate before we fetch
        setTimeout(() => reload(true), 1500)
      })
      .subscribe()

    return () => {
      try {
        window.removeEventListener('irontracks:stories:refresh', onRefresh as EventListenerOrEventListenerObject)
      } catch { }
      try {
        supabase.removeChannel(channel)
      } catch { }
    }
  }, [reload, groups.length])


  const ordered = useMemo(() => {
    const arr = Array.isArray(groups) ? groups : []
    if (!myId) return arr
    // Own avatar removed from visual row — it lives in the header Story Ring
    return arr.filter((g) => g.authorId !== myId)
  }, [groups, myId])

  // Keep own story group available for viewing from the header tap
  const myGroup = useMemo(() => {
    const arr = Array.isArray(groups) ? groups : []
    return arr.find((g) => g.authorId === myId) || null
  }, [groups, myId])

  // Listen for 'view own story' event dispatched by header tap
  useEffect(() => {
    const handler = () => {
      if (!myGroup || !Array.isArray(myGroup.stories) || myGroup.stories.length === 0) return
      setOpenAuthorId(myId)
      setOpen(true)
    }
    try { window.addEventListener('irontracks:stories:view-mine', handler) } catch { }
    return () => {
      try { window.removeEventListener('irontracks:stories:view-mine', handler) } catch { }
    }
  }, [myGroup, myId])

  // currentGroup now searches both friends (ordered) AND own story (myGroup)
  const currentGroup = useMemo(() => {
    if (openAuthorId === myId && myGroup) return myGroup
    return ordered.find((g) => g.authorId === openAuthorId) || null
  }, [ordered, openAuthorId, myId, myGroup])
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
      // Force a no-cache reload so next "Atualizar" also shows fresh data
      setTimeout(() => reload(true), 500)
    },
    [openAuthorId, reload]
  )

  return (
    <div className="mb-4">
      <StoryCreatorModal
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onPost={uploadStory}
      />
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Stories</div>
        <button
          type="button"
          onClick={() => reload(true)}
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
        {/* Shimmer skeleton placeholders while loading */}
        {!ordered.length && loading ? (
          <>
            {[0, 1, 2].map(i => (
              <div key={i} className="shrink-0 w-[72px]">
                <div className="w-16 h-16 rounded-full mx-auto bg-neutral-800 animate-pulse" />
                <div className="mt-1.5 h-2.5 w-10 bg-neutral-800 animate-pulse rounded-full mx-auto" />
              </div>
            ))}
          </>
        ) : null}
        {ordered.map((g) => {
          const hasStories = Array.isArray(g.stories) && g.stories.length > 0
          const hasUnseen = !!g.hasUnseen
          const name = String(g.displayName || '').trim() || 'Amigo'

          const ringType = !hasStories
            ? 'none'
            : hasUnseen ? 'unseen' : 'seen'

          return (
            <div key={g.authorId} className="shrink-0 w-[72px] relative">
              <button
                type="button"
                onClick={() => {
                  if (!hasStories) return
                  setOpenAuthorId(g.authorId)
                  setOpen(true)
                }}
                className="w-[72px] focus:outline-none"
                aria-label={hasStories ? `Abrir stories de ${name}` : `Sem stories de ${name}`}
              >
                {/* Gradient ring wrapper */}
                <div className="relative w-16 h-16 mx-auto">
                  {ringType === 'unseen' && (
                    <div
                      className="absolute inset-0 rounded-full animate-spin-slow"
                      style={{
                        background: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #8b5cf6, #3b82f6, #f59e0b)',
                        padding: '2px',
                        borderRadius: '9999px',
                      }}
                    />
                  )}
                  {ringType === 'seen' && (
                    <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, #525252, #737373)', padding: '2px', borderRadius: '9999px' }} />
                  )}

                  <div className={[
                    'absolute rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center',
                    ringType !== 'none' ? 'inset-[3px]' : 'inset-0 border border-neutral-800',
                  ].join(' ')}>
                    {g.photoUrl ? (
                      <Image src={g.photoUrl} alt={name} width={64} height={64} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-yellow-500 font-black">{initials(name)}</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-neutral-300 font-bold truncate text-center">{name}</div>
              </button>
            </div>
          )
        })}
      </div>

      {ordered.length === 0 && !loading && !error ? (
        <div className="mt-2 px-1 text-[11px] text-neutral-400 font-bold">
          Nenhum story de amigos ainda. Segure seu avatar no topo para publicar.
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
