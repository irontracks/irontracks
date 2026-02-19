'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import StoryViewer from '@/components/stories/StoryViewer'
import StoryCreatorModal from '@/components/stories/StoryCreatorModal'
import { Story, StoryGroup } from '@/types/social'
import { parseExt, guessMediaKind, extFromMime } from '@/utils/mediaUtils'

const initials = (name: string) => {
  const n = String(name || '').trim()
  if (!n) return '?'
  return n.slice(0, 1).toUpperCase()
}

export default function StoriesBar({ currentUserId }: { currentUserId?: string }) {
  const myId = typeof currentUserId === 'string' ? currentUserId : ''
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [openAuthorId, setOpenAuthorId] = useState<string>('')
  const [isCreatorOpen, setIsCreatorOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/social/stories/list', { method: 'GET' })
      const json = await res.json().catch((): any => null)
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

  const uploadStory = async (file: File, metadata: any = {}) => {
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

      const rawName = String(file?.name || '').trim().toLowerCase()
      const ext0 = parseExt(rawName) || extFromMime(file.type)
      const kind = guessMediaKind(file.type, ext0)
      const ext = ext0 || (kind === 'video' ? '.mp4' : '.jpg')
      const storyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      const path = `${uid}/stories/${storyId}${ext}`

      const signResp = await fetch('/api/storage/social-stories/signed-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const signJson = await signResp.json().catch((): any => null)
      if (!signResp.ok || !signJson?.ok || !signJson?.token) throw new Error(String(signJson?.error || 'Falha ao preparar upload'))

      if (typeof signJson?.bucketLimitBytes === 'number' && Number.isFinite(signJson.bucketLimitBytes) && file.size > signJson.bucketLimitBytes) {
        throw new Error(
          `Arquivo maior que o limite do bucket (${(signJson.bucketLimitBytes / (1024 * 1024)).toFixed(0)}MB). Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`
        )
      }

      const { error: upErr } = await supabase.storage
        .from('social-stories')
        .uploadToSignedUrl(path, String(signJson.token), file, { contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') })
      if (upErr) throw upErr

      const createResp = await fetch('/api/social/stories/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          mediaPath: path, 
          caption: null, 
          meta: { 
            source: 'upload',
            ...metadata // Pass filters/trim info to DB
          } 
        }),
      })
      const createJson = await createResp.json().catch((): any => null)
      if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))

      await reload()
    } catch (e: any) {
      const msg = String(e?.message || e)
      console.error('Story upload error:', e)
      const low = msg.toLowerCase()
      if (low.includes('exceeded') && low.includes('maximum') && low.includes('size')) {
        setError('Arquivo excede o limite de upload do Storage. Se o vídeo estiver <= 200MB, ajuste o “Global upload limit” no Supabase Storage.')
        return
      }
      setError(msg === 'unauthorized' ? 'Faça login novamente para publicar.' : `Erro: ${msg}`)
    } finally {
      setUploading(false)
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
      <StoryCreatorModal
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onPost={uploadStory}
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
          const isMine = g.authorId === myId
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
                <div className={`w-16 h-16 rounded-full border-2 ${ringCls} p-1 mx-auto relative`}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                    {g.photoUrl ? (
                      <Image src={g.photoUrl} alt={name} width={64} height={64} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-yellow-500 font-black">{initials(name)}</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-neutral-300 font-bold truncate text-center">{name}</div>
              </button>

              {isMine ? (
                <button
                  type="button"
                  onClick={() => {
                    if (uploading) return
                    setIsCreatorOpen(true)
                  }}
                  className="absolute left-[calc(50%+18px)] top-[44px] w-6 h-6 rounded-full bg-yellow-500 border-2 border-black flex items-center justify-center"
                  aria-label="Adicionar story (foto ou vídeo)"
                  disabled={uploading}
                >
                  <Plus size={14} className="text-black" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {ordered.length === 0 && !loading && !error ? (
        <div className="mt-2 px-1 text-[11px] text-neutral-400 font-bold">
          Stories ainda não carregaram. Toque em <span className="text-neutral-200">Atualizar</span>.
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
