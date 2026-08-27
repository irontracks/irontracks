'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Heart, MessageCircle, X, Eye, Trash2, Loader2, Volume2, VolumeX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDialog } from '@/contexts/DialogContext'
import { Story, StoryGroup } from '@/types/social'
import { mediaKindFromUrl } from '@/utils/mediaUtils'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { apiSocial } from '@/lib/api'
import { publicDisplayName } from '@/lib/user/publicDisplayName'

const MAX_VIDEO_SECONDS = 60
const PHOTO_SECONDS = 15
const MIN_VIDEO_SECONDS = 3
const STALL_THRESHOLD_MS = 2500
const INITIAL_STALL_THRESHOLD_MS = 15000
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
    const nav = typeof navigator !== 'undefined' ? navigator as unknown as Record<string, unknown> : null
    if (nav && nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true
  } catch { }
  return false
}

// --- Componente Principal ---
interface StoryViewerProps {
  group: StoryGroup
  myId: string
  onClose: () => void
  onStoryUpdated: (storyId: string, patch: Partial<Story>) => void
  onStoryDeleted: (storyId: string) => void
  /** Pula pro PRÓXIMO usuário (estilo Instagram). Retorna true se avançou; false se era o último. */
  onNextUser?: () => boolean
  /** Volta pro usuário ANTERIOR. Retorna true se voltou; false se era o primeiro. */
  onPrevUser?: () => boolean
}

export default function StoryViewer({
  group,
  myId,
  onClose,
  onStoryUpdated,
  onStoryDeleted,
  onNextUser,
  onPrevUser,
}: StoryViewerProps) {
  const { confirm, alert } = useDialog()
  const stories = useMemo(() => (Array.isArray(group.stories) ? group.stories : []), [group.stories])
  /*
   * Abre no primeiro NÃO VISTO, como o Instagram — não no começo da lista.
   * Com a ordem cronológica (mais antigo primeiro), começar sempre em 0 obrigaria
   * o usuário a reassistir tudo que já viu para chegar no story novo do amigo.
   * Tudo visto (ou grupo vazio) → volta ao início, que é o comportamento certo
   * para rever.
   */
  const [idx, setIdx] = useState(() => {
    const first = stories.findIndex((s) => s?.viewed !== true)
    return first >= 0 ? first : 0
  })
  const story = stories[idx] || null

  // Estados de UI
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  /** Falha ao reagir — antes a reação era otimista e NUNCA revertia. */
  const [reactError, setReactError] = useState('')
  const [comments, setComments] = useState<unknown[]>([])
  const [commentText, setCommentText] = useState('')

  const [viewersOpen, setViewersOpen] = useState(false)
  const [viewersLoading, setViewersLoading] = useState(false)
  const [viewersError, setViewersError] = useState('')
  const [viewers, setViewers] = useState<unknown[]>([])
  const viewersStoryIdRef = useRef<string>('')

  const [deleting, setDeleting] = useState(false)
  const [holding, setHolding] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [durationMs, setDurationMs] = useState(5000)
  const [muted, setMuted] = useState(true)
  const [videoError, setVideoError] = useState('')
  const [reactedEmoji, setReactedEmoji] = useState<string | null>(null) // "pop" temporário de confirmação
  const [myReaction, setMyReaction] = useState<string | null>(null)     // reação PERSISTENTE do usuário (fixa)
  const [isReacting, setIsReacting] = useState(false)
  const [liking, setLiking] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)

  /*
   * Puxar para baixo fecha (pedido do dono, 05/08/2026) — o gesto que todo mundo
   * já tenta por reflexo, vindo do Instagram.
   *
   * O card é arrastado por REF, não por estado: um `setState` por `pointermove`
   * re-renderizaria o viewer inteiro a ~60×/s, competindo com o RAF da barra de
   * progresso justamente durante o gesto — o que daria de volta o travamento que
   * acabamos de tirar.
   */
  const cardRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const draggedRef = useRef(false)
  /** Distância suficiente para fechar sem flick. */
  const CLOSE_DISTANCE_PX = 110
  /** Flick curto e rápido também fecha (px/ms). */
  const CLOSE_VELOCITY = 0.5
  /** Abaixo disto ainda é toque, não arrasto — senão o tap de navegação vira gesto. */
  const DRAG_SLOP_PX = 8

  const paintDrag = (dy: number) => {
    const el = cardRef.current
    if (!el) return
    el.style.transition = dy === 0 ? 'transform 180ms ease-out, opacity 180ms ease-out' : 'none'
    el.style.transform = dy === 0 ? '' : `translateY(${dy}px)`
    el.style.opacity = dy === 0 ? '' : String(Math.max(0.35, 1 - dy / 420))
  }

  // Use a single "paused" state that controls CSS animation-play-state
  // This avoids tearing down useEffect loops on every touch
  const isPaused = holding || commentsOpen || viewersOpen || hidden || deleting

  const _rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)
  const closeRequestedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  /*
   * O ELEMENTO de vídeo como estado (além do ref). Ver o comentário no `ref` do
   * <video>: sem isto, os efeitos de vídeo perdiam a janela de montagem e o
   * story de vídeo ficava sem barra de progresso.
   */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const preloadRef = useRef<{ aborts: AbortController[] }>({ aborts: [] })
  const stallRef = useRef<{ lastTime: number; lastTs: number; attempts: number }>({ lastTime: 0, lastTs: 0, attempts: 0 })
  const advanceLockRef = useRef<string>('')
  const barRefsRef = useRef<(HTMLDivElement | null)[]>([])
  // Ref mirrors for paused state so video RAF loop doesn't need state deps
  const pausedRef = useRef(false)
  pausedRef.current = isPaused

  const name = group.authorId === myId ? 'Você' : publicDisplayName(group.displayName, 'Amigo')
  const isMine = String(group.authorId || '').trim() === String(myId || '').trim()
  const storyId = story?.id
  const storyViewed = Boolean(story?.viewed)
  const storyMediaUrl = story?.mediaUrl || ''
  const storyObj = story && typeof story === 'object' ? (story as Record<string, unknown>) : ({} as Record<string, unknown>)
  const storyMediaKind = storyObj?.mediaKind
  const storyMeta = storyObj?.meta && typeof storyObj.meta === 'object' ? (storyObj.meta as Record<string, unknown>) : null
  const storyTrimRaw = storyMeta?.trim ?? storyObj?.trim
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
    const rawObj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    const rawArr = Array.isArray(raw) ? raw : null
    const start = Number(rawObj?.start ?? rawArr?.[0] ?? 0)
    const end = Number(rawObj?.end ?? rawArr?.[1] ?? 0)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    return { start, end }
  }, [storyTrimRaw])

  // Marcar como visto
  useEffect(() => {
    if (!storyId || storyViewed) return
    onStoryUpdated(storyId, { viewed: true })
    apiSocial.viewStory(storyId).catch(() => { })
  }, [storyId, storyViewed, onStoryUpdated])

  // Reação persistente: inicializa com o emoji que o usuário já reagiu (vem da list como
  // `myReaction`). Sem isto, o destaque começava vazio e sumia após 1,2s → "não fixava".
  useEffect(() => {
    const mine = String((storyObj?.myReaction as string) || '').trim()
    setMyReaction(mine || null)
  }, [storyId, storyObj?.myReaction])

  // Navegação e Timer
  const goNext = useCallback(() => {
    setIdx((v) => {
      const nextIdx = v + 1
      if (nextIdx >= stories.length) {
        // Fim dos stories DESTE usuário → tenta pular pro próximo usuário (estilo Instagram).
        // Só fecha se não houver próximo. O onNextUser troca o grupo no pai (StoriesBar) e o
        // key={authorId} remonta o viewer do zero (idx=0, timers resetados).
        const advanced = onNextUser ? onNextUser() : false
        if (!advanced && !closeRequestedRef.current) {
          closeRequestedRef.current = true
          setTimeout(() => onClose(), 0)
        }
        return v
      }
      return nextIdx
    })
  }, [onClose, stories.length, onNextUser])

  // Tap na borda ESQUERDA no primeiro story → volta pro usuário anterior (se houver).
  const goPrev = useCallback(() => {
    setIdx((v) => {
      if (v <= 0) { onPrevUser?.(); return 0 }
      return v - 1
    })
  }, [onPrevUser])

  useEffect(() => {
    elapsedRef.current = 0
    lastTsRef.current = 0
    setCommentsOpen(false)
    setViewersOpen(false)
    setMuted(true)
    setVideoError('')
    setViewersError('')
    setViewers([])
    /*
     * `comments` e `commentText` também são POR STORY. Sem limpar: ao avançar com
     * o painel aberto, os comentários do story anterior ficavam na tela até o novo
     * `loadComments` responder, e um rascunho não enviado seguia no campo do
     * próximo story — pronto para ser enviado para o story errado.
     */
    setComments([])
    setCommentText('')
    setCommentsError('')
    setReactError('')
    viewersStoryIdRef.current = ''
    stallRef.current = { lastTime: 0, lastTs: 0, attempts: 0 }
    advanceLockRef.current = ''
    /*
     * Barras: cada troca de story REDESENHA a régua inteira.
     *
     * Bug reportado pelo dono (05/08/2026, com print): ao passar para o story
     * seguinte, a barra do PRIMEIRO continuava correndo — "como se ainda
     * estivesse no primeiro". Causa: a barra da foto é uma animação CSS
     * (`story-bar-fill … forwards`) aplicada no elemento do índice atual, e
     * ninguém a REMOVIA ao sair dele. Zerar só o `transform` não resolve:
     * enquanto a animação existe, é ela quem manda no transform — o valor
     * escrito aqui era descartado no frame seguinte. Se o story seguinte fosse
     * vídeo, o efeito da foto nem rodava (sai cedo em `isVideo`), e a animação
     * órfã do anterior seguia avançando na tela.
     *
     * Daí `animation = 'none'` em TODAS as barras. E o estado certo de cada uma
     * não é "vazia": as já assistidas ficam CHEIAS, as futuras vazias — senão
     * passar de story apagava o histórico da régua.
     */
    barRefsRef.current.forEach((el, i) => {
      if (!el) return
      el.style.animation = 'none'
      el.style.transform = `scaleX(${i < idx ? 1 : 0})`
    })
  }, [storyId, idx])

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      const el = videoRef.current
      if (el) {
        el.muted = next
        if (!next) {
          const p = el.play()
          if (p) p.catch(() => { })
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
      } catch { }
    }
    preloadRef.current.aborts = []

    const candidates = [stories[idx - 1] || null, stories[idx + 1] || null].filter(Boolean) as unknown[]
    for (const s of candidates) {
      const url = String((s as Record<string, unknown>)?.mediaUrl || '').trim()
      if (!url) continue
      const a = new AbortController()
      preloadRef.current.aborts.push(a)
      fetch(url, { headers: { Range: 'bytes=0-0' }, signal: a.signal }).catch(() => { })
    }
  }, [idx, stories])

  // Detectar tab oculta
  useEffect(() => {
    const onVis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ===== PHOTO PROGRESS: pure CSS animation, pause/resume via ref =====
  // Control animationPlayState imperatively so React re-renders never restart the animation
  useEffect(() => {
    if (isVideo && !needsVideoFallback) return
    const el = barRefsRef.current[idx]
    if (!el) return
    el.style.animationPlayState = isPaused ? 'paused' : 'running'
  }, [isPaused, idx, isVideo, needsVideoFallback])

  // Set animation on mount for the current photo bar — only restarts on story change
  useEffect(() => {
    if (!storyId || (isVideo && !needsVideoFallback)) return
    const el = barRefsRef.current[idx]
    if (!el) return
    // Reset and apply animation imperatively (never via React inline style)
    el.style.animation = 'none'
    // Force reflow to restart animation cleanly
    void el.offsetWidth
    el.style.animation = `story-bar-fill ${durationMs}ms linear forwards`
    el.style.animationPlayState = pausedRef.current ? 'paused' : 'running'

    const onEnd = () => {
      elapsedRef.current = 0
      goNext()
    }
    el.addEventListener('animationend', onEnd)
    return () => {
      el.removeEventListener('animationend', onEnd)
      /*
       * Desliga a animação DESTA barra ao sair do story. Sem isto ela sobrevive
       * ao próprio story: o cleanup só tirava o listener, e a animação seguia
       * correndo no segmento antigo enquanto o usuário já estava no próximo.
       */
      el.style.animation = 'none'
    }
  }, [storyId, idx, durationMs, isVideo, needsVideoFallback, goNext])

  /*
   * ===== PROGRESSO DO VÍDEO — requestAnimationFrame de verdade =====
   *
   * Este bloco DIZIA "RAF loop" e não tinha um `requestAnimationFrame` sequer:
   * atualizava a barra no evento `timeupdate`, que o navegador dispara a ~4× por
   * segundo (o Safari/iOS fica perto de 250 ms). A barra andava aos saltos —
   * "sensação de app amador", nas palavras do dono.
   *
   * Agora o loop roda a cada frame (~60 fps) e lê `paused` do ref, sem depender de
   * estado: nenhuma dependência nova reinicia o efeito no meio do story.
   */
  useEffect(() => {
    if (!storyId || !isVideo) return
    const v = videoRef.current
    if (!v) return

    const applyProgress = (p: number) => {
      const el = barRefsRef.current[idx]
      if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`
    }

    const update = () => {
      if (pausedRef.current) return
      const d = Number(v.duration || 0)
      if (!Number.isFinite(d) || d <= 0) return
      const start = Math.max(0, Number(trimRange?.start ?? 0))
      const rawEnd = Number(trimRange?.end ?? d)
      const maxEnd = Math.min(rawEnd, start + MAX_VIDEO_SECONDS)
      const end = Math.max(start + MIN_VIDEO_SECONDS, Math.min(d, maxEnd))
      const ct = Number(v.currentTime || 0)
      if (Number.isFinite(start) && ct < start) {
        try { v.currentTime = start } catch { }
      }
      const effective = Math.max(0.1, end - start)
      const clamped = Math.min(end, Math.max(start, ct))
      const next = Math.max(0, Math.min(1, (clamped - start) / effective))
      applyProgress(next)
      if (clamped >= end - 0.05) {
        if (advanceLockRef.current !== String(storyId || '')) {
          advanceLockRef.current = String(storyId || '')
          applyProgress(0)
          goNext()
        }
      }
    }
    let raf = 0
    const tick = () => {
      update()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    /*
     * `durationchange` continua: a duração só chega depois dos metadados, e sem
     * ela o `update` sai cedo (`d <= 0`) sem desenhar nada. O `timeupdate` saiu —
     * era a fonte dos saltos e o RAF já cobre tudo que ele cobria.
     */
    v.addEventListener('durationchange', update)
    update()
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('durationchange', update)
    }
  }, [isVideo, storyId, idx, goNext, trimRange?.start, trimRange?.end, videoEl])

  // Controle de Video Play/Pause
  useEffect(() => {
    if (!storyId || !isVideo) return
    const v = videoRef.current
    if (!v) return
    const paused = holding || commentsOpen || viewersOpen || hidden || deleting
    if (paused) v.pause()
    else v.play().catch(() => { })
  }, [commentsOpen, deleting, hidden, holding, isVideo, storyId, viewersOpen, videoEl])

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
        // If it's the very beginning and hasn't started playing yet, give it more time finding the first frame
        const isInitialLoad = current === 0 && v.readyState < 3;
        const threshold = isInitialLoad ? INITIAL_STALL_THRESHOLD_MS : STALL_THRESHOLD_MS;

        if (now - lastTs >= threshold) {
          stallRef.current.lastTs = now
          stallRef.current.attempts += 1
          if (stallRef.current.attempts >= 2) {
            setVideoError('Este vídeo não carregou no seu dispositivo.')
            return
          }
          try {
            v.load()
          } catch { }
          try {
            const p = v.play()
            if (p) p.catch(() => { })
          } catch { }
        }
      } else {
        stallRef.current.lastTime = current
        stallRef.current.lastTs = now
      }
    }, STALL_CHECK_MS)
    return () => {
      mounted = false
      try { window.clearInterval(timer) } catch { }
    }
  }, [commentsOpen, deleting, hidden, holding, isVideo, storyId, viewersOpen, videoEl])

  // Carregar Dados
  const loadComments = async (storyId: string) => {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const json = await apiSocial.getStoryComments(storyId, 200)
      setComments((json as Record<string, unknown>).data as unknown[] || [])
    } catch (e: unknown) {
      setCommentsError(getErrorMessage(e))
    } finally {
      setCommentsLoading(false)
    }
  }

  const loadViewers = async (storyId: string) => {
    setViewersLoading(true)
    setViewersError('')
    try {
      const json = await apiSocial.getStoryViews(storyId)
      setViewers((json as Record<string, unknown>).data as unknown[] || [])
      viewersStoryIdRef.current = storyId
    } catch (e: unknown) {
      setViewersError(getErrorMessage(e))
    } finally {
      setViewersLoading(false)
    }
  }

  // Ações
  const toggleLike = async () => {
    if (!story?.id || liking) return
    setLiking(true)
    const nextLiked = !story.hasLiked
    /*
     * A reação NÃO é mais tocada aqui. Ela vive em `social_story_reactions` desde
     * a migration `split_story_reactions_from_likes`; antes morava na mesma linha
     * de `social_story_likes` e descurtir a apagava junto, sem aviso.
     */
    onStoryUpdated(story.id, { hasLiked: nextLiked, likeCount: Math.max(0, story.likeCount + (nextLiked ? 1 : -1)) })
    try {
      await apiSocial.likeStory(story.id, nextLiked)
    } catch {
      onStoryUpdated(story.id, { hasLiked: story.hasLiked, likeCount: story.likeCount })
    } finally {
      setLiking(false)
    }
  }

  const sendComment = async () => {
    if (!story?.id || !commentText.trim() || sendingComment) return
    setSendingComment(true)
    const text = commentText.trim()
    setCommentText('')
    setCommentsError('')
    try {
      const json = await apiSocial.addStoryComment(story.id, text)
      if (!(json as Record<string, unknown>).ok) throw new Error('send_failed')
      setComments((prev) => [...prev, (json as Record<string, unknown>).data])
      onStoryUpdated(story.id, { commentCount: story.commentCount + 1 })
    } catch (e: unknown) {
      /*
       * O texto é limpo do campo ANTES do envio (para a UI responder na hora).
       * Sem devolvê-lo aqui, uma falha de rede fazia a mensagem do usuário
       * simplesmente DESAPARECER: ele digitava, o campo esvaziava, nada era
       * enviado e nada era dito. O `catch {}` vazio engolia tudo.
       */
      setCommentText(text)
      setCommentsError(getErrorMessage(e) || 'Não consegui enviar. Tente de novo.')
      logError('story:comment:send', e)
    } finally {
      setSendingComment(false)
    }
  }

  const handleDelete = async () => {
    if (!story?.id || deleting) return
    const ok = await confirm('Tem certeza que deseja deletar este story?\nEssa ação é irreversível.', 'Deletar story', { confirmText: 'Deletar', cancelText: 'Cancelar' })
    if (!ok) return
    setDeleting(true)
    try {
      const json = await apiSocial.deleteStory(story.id).catch(() => null) as Record<string, unknown> | null
      if (json?.ok) {
        onStoryDeleted(story.id)
        onClose()
      } else {
        const errMsg = (json?.error as string | undefined) || 'Falha ao deletar'
        logError('StoryViewer.delete', `Delete failed`, json)
        await alert(`Erro ao deletar: ${errMsg}`)
      }
    } catch (e) {
      logError('StoryViewer.delete', e)
      await alert('Erro ao deletar story. Verifique sua conexão.')
    } finally {
      setDeleting(false)
    }
  }

  if (!story) return null
  /*
     * A lista aberta é a fonte mais fresca (acabou de vir do servidor); fora dela
     * vale o número que a própria listagem já traz. Antes o `else` era `0`, então
     * o autor via "0 visualizações" até tocar no olho — e um story visto por 30
     * pessoas parecia não ter alcançado ninguém.
     */
  const viewCount = viewersStoryIdRef.current === story.id ? viewers.length : (story.viewCount ?? 0)

  return (
    <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center pt-safe pb-safe">
      <div
        className="absolute inset-0"
        onClick={deleting ? undefined : onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' && !deleting) onClose() }}
        role="button"
        tabIndex={-1}
        aria-label="Fechar viewer"
      />

      <div
        ref={cardRef}
        className="relative w-full max-w-md h-[92vh] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl"
        onPointerDown={(e) => {
          setHolding(true)
          draggedRef.current = false
          // Um gesto que NASCE dentro da folha de comentários/espectadores é
          // rolagem da lista, não intenção de fechar o story.
          if ((e.target as HTMLElement | null)?.closest?.('[data-story-sheet]')) {
            dragStartRef.current = null
            return
          }
          dragStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
        }}
        onPointerMove={(e) => {
          const start = dragStartRef.current
          if (!start) return
          const dy = e.clientY - start.y
          const dx = e.clientX - start.x
          // Só assume o gesto quando ele é claramente VERTICAL: navegar entre
          // stories é toque lateral e não pode virar arrasto.
          if (!draggedRef.current && Math.abs(dy) > DRAG_SLOP_PX && Math.abs(dy) > Math.abs(dx)) draggedRef.current = true
          if (draggedRef.current) paintDrag(Math.max(0, dy))
        }}
        onPointerUp={(e) => {
          setHolding(false)
          const start = dragStartRef.current
          dragStartRef.current = null
          if (start && draggedRef.current) {
            const dy = e.clientY - start.y
            const dt = Math.max(1, Date.now() - start.t)
            if (dy > CLOSE_DISTANCE_PX || (dy > 40 && dy / dt > CLOSE_VELOCITY)) {
              onClose()
              return
            }
          }
          paintDrag(0) // não fechou: volta ao lugar
        }}
        onPointerCancel={() => {
          setHolding(false)
          dragStartRef.current = null
          draggedRef.current = false
          paintDrag(0)
        }}
        onClickCapture={(e) => {
          // Sem isto, soltar o arrasto sobre a área de toque lateral também
          // AVANÇAVA o story — o clique nasce do mesmo pointerup.
          if (draggedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            draggedRef.current = false
          }
        }}
      >
        {/* Header / Barra de Progresso */}
        <div className="absolute top-0 left-0 right-0 p-3 z-20 bg-gradient-to-b from-black/80 to-transparent">
          {/* Barras de progresso */}
          <div className="flex gap-1 mb-2">
            {stories.map((s, i) => {
              const isDone = i < idx
              // All bars render the same — the animation is set imperatively via ref
              return (
                <div key={s.id} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                  <div
                    ref={(el) => { barRefsRef.current[i] = el }}
                    className="h-full rounded-full bg-white/90 origin-left will-change-transform"
                    style={{ transform: `scaleX(${isDone ? 1 : 0})` }}
                  />
                </div>
              )
            })}
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
              <button aria-label="Excluir story" onClick={handleDelete} disabled={deleting} className="tap-44 w-10 h-10 rounded-xl bg-black/40 text-red-400 flex items-center justify-center hover:bg-black/60 disabled:opacity-60">
                {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              </button>
            )}
            {isVideo && (
              <button
                onClick={toggleMuted}
                className="tap-44 w-10 h-10 rounded-xl bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                aria-label={muted ? 'Ativar som' : 'Desativar som'}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <button aria-label="Fechar" onClick={onClose} className="tap-44 w-10 h-10 rounded-xl bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
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
                        ref={(el) => {
                          /*
                           * O ref vira ESTADO de propósito. Com `AnimatePresence
                           * mode="wait"`, o <video> do story seguinte só monta
                           * depois da animação de saída do anterior — quando os
                           * efeitos de vídeo rodavam, `videoRef.current` ainda era
                           * null, eles saíam com `if (!v) return` e nunca mais
                           * tentavam (as deps não mudavam). Sintoma: no story de
                           * vídeo a barra de progresso NÃO APARECIA.
                           */
                          videoRef.current = el
                          setVideoEl(el)
                        }}
                        src={videoSrc}
                        className="w-full h-full object-contain"
                        playsInline
                        muted={muted}
                        autoPlay
                        preload="metadata"
                        aria-label="Vídeo do story"
                        onLoadedMetadata={(e) => {
                          const d = Number((e.currentTarget as HTMLVideoElement)?.duration || 0)
                          const start = Math.max(0, Number(trimRange?.start ?? 0))
                          const rawEnd = Number(trimRange?.end ?? d)
                          const maxEnd = Math.min(rawEnd, start + MAX_VIDEO_SECONDS)
                          const end = Math.max(start + MIN_VIDEO_SECONDS, Math.min(d, maxEnd))
                          if (d > 0) setDurationMs(Math.max(MIN_VIDEO_SECONDS * 1000, Math.min(MAX_VIDEO_SECONDS * 1000, (end - start) * 1000)))
                          try { if (Number.isFinite(start) && start > 0) e.currentTarget.currentTime = start } catch { }
                        }}
                        onEnded={() => {
                          if (advanceLockRef.current !== String(story?.id || '')) {
                            advanceLockRef.current = String(story?.id || '')
                            const el = barRefsRef.current[idx]
                            if (el) el.style.transform = 'scaleX(0)'
                            goNext()
                          }
                        }}
                        onError={() => setVideoError('Não foi possível reproduzir este vídeo.')}
                      >
                        <track kind="captions" />
                      </video>
                    ) : (
                      <div className="px-6 text-center">
                        <div className="text-white font-black text-lg">Story indisponível</div>
                        <div className="mt-2 text-sm text-neutral-300 font-semibold">
                          {videoError || (isIOS && isWebm ? 'Este story foi publicado em WEBM e pode não funcionar no iPhone.' : 'Não foi possível carregar o vídeo.')}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const el = barRefsRef.current[idx]
                            if (el) el.style.transform = 'scaleX(0)'
                            goNext()
                          }}
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
                <div className="text-neutral-400 font-bold">Mídia indisponível</div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Sem overlay de horário aqui: o badge de hora já vem queimado na imagem
              gerada pelo composer (bottom-right). Dois relógios = redundância. */}
        </div>

        {/* Áreas de Toque para Navegação */}
        <button className="absolute left-0 top-20 bottom-20 w-1/3 z-10" onClick={goPrev} aria-label="Anterior" />
        <button className="absolute right-0 top-20 bottom-20 w-1/3 z-10" onClick={goNext} aria-label="Próximo" />

        {/* Footer / Controles */}
        <div className="absolute bottom-0 left-0 right-0 p-3 z-20 bg-gradient-to-t from-black/90 to-transparent pt-12">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isMine && (
                <div className="flex flex-col items-center">
                  <button aria-label="Ver quem assistiu" onClick={() => { setViewersOpen(!viewersOpen); setCommentsOpen(false); if (!viewersOpen) loadViewers(story.id) }} className="w-12 h-12 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-white flex items-center justify-center">
                    <Eye size={20} />
                  </button>
                  <span className="text-[10px] font-bold text-white drop-shadow">{viewCount}</span>
                </div>
              )}

              <div className="flex flex-col items-center">
                {/*
                  * No story do próprio autor o coração é PLACAR, não botão: ele
                  * clicava e curtia a si mesmo (a barra de emoji já era escondida
                  * para ele, mas o coração não). O servidor também recusa agora.
                  */}
                {isMine ? (
                  <div className="w-12 h-12 rounded-2xl border border-neutral-800 bg-neutral-900/80 text-neutral-400 flex items-center justify-center" aria-label={`${story.likeCount} curtidas`}>
                    <Heart size={20} />
                  </div>
                ) : (
                  <button aria-label="Curtir" onClick={toggleLike} disabled={liking} className={`w-12 h-12 rounded-2xl border flex items-center justify-center disabled:opacity-60 ${story.hasLiked ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-neutral-900/80 border-neutral-800 text-white'}`}>
                    <Heart size={20} className={story.hasLiked ? 'fill-current' : ''} />
                  </button>
                )}
                <span className="text-[10px] font-bold text-white drop-shadow">{story.likeCount}</span>
              </div>

              <div className="flex flex-col items-center">
                <button aria-label="Comentários" onClick={() => { setCommentsOpen(!commentsOpen); setViewersOpen(false); if (!commentsOpen) loadComments(story.id) }} className="w-12 h-12 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-white flex items-center justify-center">
                  <MessageCircle size={20} />
                </button>
                <span className="text-[10px] font-bold text-white drop-shadow">{story.commentCount}</span>
              </div>
            </div>
          </div>

          {/* Emoji Reaction Bar */}
          {!isMine && (
            <div className="flex items-center justify-center gap-3 mt-2">
              {['🔥', '💪', '👏', '🫡', '❤️'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={isReacting}
                  onClick={async () => {
                    /*
                     * Otimista COM reversão. Antes: `fetch` cru + `catch {}` vazio.
                     * `fetch` não rejeita em 4xx/5xx, então 403 (a RLS barra quem não
                     * pode ver o story), 429 (rate limit) e 500 passavam como
                     * sucesso: o emoji ficava fixado com "Reação enviada!" e o
                     * servidor não tinha nada. O usuário só descobria ao reabrir.
                     */
                    const previous = myReaction
                    setIsReacting(true)
                    setMyReaction(emoji)          // fixa a reação (persistente)
                    setReactedEmoji(emoji)        // "pop" de confirmação
                    setTimeout(() => setReactedEmoji(null), 1200)
                    setReactError('')
                    try {
                      const res = await fetch('/api/social/stories/react', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ storyId: story.id, emoji }),
                      })
                      const json = await res.json().catch((): null => null) as { ok?: boolean } | null
                      if (!res.ok || !json?.ok) throw new Error(`react_failed_${res.status}`)
                    } catch (e: unknown) {
                      setMyReaction(previous)
                      setReactedEmoji(null)
                      setReactError('Não consegui enviar sua reação.')
                      logError('story:react', e)
                    } finally {
                      setIsReacting(false)
                    }
                  }}
                  className={`tap-44 w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-200 active:scale-125 disabled:opacity-60 ${
                    myReaction === emoji ? 'bg-yellow-500/20 border-yellow-500/60' : 'bg-neutral-900/80 hover:bg-neutral-800/80 border-neutral-800'
                  } ${reactedEmoji === emoji ? 'scale-125' : ''} border`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {reactedEmoji && (
            <div className="text-center mt-1 text-[11px] text-yellow-500 font-bold animate-pulse">Reação enviada!</div>
          )}
          {/* "Reação enviada!" era exibido mesmo quando o servidor recusava. */}
          {reactError ? (
            <div className="text-center mt-1 text-[11px] text-red-300 font-bold" role="alert">{reactError}</div>
          ) : null}

          {/* Modal de Comentários / Views */}
          {(commentsOpen || viewersOpen) && (
            <motion.div data-story-sheet initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-3 bg-neutral-900/95 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="max-h-[30vh] overflow-y-auto custom-scrollbar p-3 space-y-3">
                {viewersOpen && viewers.map((v) => (
                  <div key={String((v as Record<string, unknown>).viewerId ?? "")} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 overflow-hidden">
                      {(v as Record<string, unknown>).photoUrl ? <Image src={String((v as Record<string, unknown>).photoUrl)} width={32} height={32} alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs text-yellow-500">{initials(publicDisplayName((v as Record<string, unknown>).displayName))}</div>}
                    </div>
                    <span className="text-xs font-bold text-white flex-1">{publicDisplayName((v as Record<string, unknown>).displayName)}</span>
                    <span className="text-[10px] text-neutral-400">{formatAgo((v as Record<string, unknown>).viewedAt as string)}</span>
                  </div>
                ))}
                {commentsOpen && comments.map((c) => (
                  <div key={String((c as Record<string, unknown>).id ?? "")} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 overflow-hidden shrink-0">
                      {(c as Record<string, unknown>).user && typeof (c as Record<string, unknown>).user === 'object' && ((c as Record<string, Record<string, unknown>>).user?.photoUrl) ? <Image src={String((c as Record<string, Record<string, unknown>>).user.photoUrl)} width={32} height={32} alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs text-yellow-500">{initials(publicDisplayName((c as Record<string, Record<string, unknown>>).user?.displayName))}</div>}
                    </div>
                    <div>
                      <div className="text-xs font-black text-white">{publicDisplayName((c as Record<string, Record<string, unknown>>).user?.displayName)}</div>
                      <div className="text-xs text-neutral-300">{String((c as Record<string, unknown>).body || '')}</div>
                    </div>
                  </div>
                ))}
                {/* Sem isto, falha de rede/403/500 ao listar caía no mesmo "Nada por
                    aqui ainda." de quando realmente não há nada — o usuário nunca
                    sabia que tinha dado erro. */}
                {viewersOpen && viewersError ? (
                  <div className="text-center text-xs text-red-300 py-2" role="alert">{viewersError}</div>
                ) : null}
                {commentsOpen && commentsError && !comments.length ? (
                  <div className="text-center text-xs text-red-300 py-2" role="alert">{commentsError}</div>
                ) : null}
                {((viewersOpen && !viewers.length && !viewersLoading && !viewersError) || (commentsOpen && !comments.length && !commentsLoading && !commentsError)) && (
                  <div className="text-center text-xs text-neutral-400 py-2">Nada por aqui ainda.</div>
                )}
              </div>

              {commentsOpen && (
                <div className="border-t border-neutral-800">
                  {/* O erro existia no estado desde sempre e NUNCA era renderizado
                      (a variável estava prefixada com `_`, marcada como não usada).
                      Falha de envio ou de carregamento era invisível. */}
                  {commentsError ? (
                    <div className="px-3 pt-2 text-[11px] text-red-300" role="alert">{commentsError}</div>
                  ) : null}
                  <div className="p-2 flex gap-2">
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendComment() } }}
                      className="flex-1 bg-black/40 border border-neutral-700 rounded-xl px-3 text-xs text-white"
                      placeholder="Escreva..."
                      aria-label="Escrever comentário"
                    />
                    <button onClick={sendComment} disabled={sendingComment || !commentText.trim()} className="px-3 py-2 bg-yellow-500 rounded-xl text-black text-xs font-black disabled:opacity-60">
                      {sendingComment ? '...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
