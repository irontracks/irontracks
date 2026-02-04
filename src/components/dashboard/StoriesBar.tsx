'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import StoryViewer from '@/components/stories/StoryViewer'
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
      const ext0 = parseExt(rawName) || extFromMime(file.type)
      const kind = guessMediaKind(file.type, ext0)
      if (kind === 'video' && (ext0 === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
        throw new Error('WEBM pode não rodar no Safari. Prefira MP4/MOV.')
      }
      const ext = ext0 || (kind === 'video' ? '.mp4' : '.jpg')
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
        .uploadToSignedUrl(path, String(signJson.token), file, { contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') })
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
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
          if (!f) return
          const ext0 = parseExt(String(f.name || '')) || extFromMime(f.type)
          const kind = guessMediaKind(f.type, ext0)
          if (kind !== 'image' && kind !== 'video') {
            setError('Selecione uma imagem ou um vídeo.')
            return
          }
          if (kind === 'video' && (ext0 === '.webm' || String(f?.type || '').toLowerCase() === 'video/webm')) {
            setError('Formato WEBM pode não rodar no Safari. Prefira MP4/MOV.')
            return
          }
          if (kind === 'video' && !ext0) {
            setError('Formato de vídeo não suportado. Use MP4.')
            return
          }
          if (kind === 'image' && f.size > 12 * 1024 * 1024) {
            setError('Imagem muito grande (máx 12MB).')
            return
          }
          if (kind === 'video' && f.size > 50 * 1024 * 1024) {
            setError('Vídeo muito grande (máx 50MB).')
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
                    if (uploadRef.current) uploadRef.current.click()
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
