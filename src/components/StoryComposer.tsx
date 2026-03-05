'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { X, Upload, Layout, Move, Info, AlertCircle, CheckCircle2, RotateCcw, Scissors, Loader2, Download, Crown } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getKcalEstimate } from '@/utils/calories/kcalClient'
import { motion, AnimatePresence } from 'framer-motion'
import VideoTrimmer from '@/components/stories/VideoTrimmer'
import { VideoCompositor } from '@/lib/video/VideoCompositor'
import { getErrorMessage } from '@/utils/errorMessage'
import { isIosNative } from '@/utils/platform'
import { safeString } from '@/utils/guards'
import { saveImageToPhotos, saveBlobToPhotos, openAppSettings } from '@/utils/native/irontracksNative'
import { uploadStoryMedia } from '@/utils/storage/mediaUpload'
import { logError, logWarn, logInfo } from '@/lib/logger'
import {
  SessionLite,
  Metrics,
  LivePosition,
  LivePositions,
  LayoutOption,
  CANVAS_W,
  CANVAS_H,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_SIDE,
  STORY_LAYOUTS,
  DEFAULT_LIVE_POSITIONS,
  isIOSUserAgent,
  pickFirstSupportedMime,
  parseExt,
  extFromMime,
  guessMediaKind,
  formatDatePt,
  formatDuration,
  calculateTotalVolume,
  computeKcal,
  fitCover,
  clamp01,
  clampPctWithSize,
  drawRoundedRect,
  computeLiveSizes,
  drawStory,
} from './storyComposerUtils'
import { StoryComposerIosSavePanel } from './StoryComposerIosSavePanel'

interface StoryComposerProps {
  open: boolean
  session: SessionLite
  onClose: () => void
}

export default function StoryComposer({ open, session, onClose }: StoryComposerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mediaKind, setMediaKind] = useState<'image' | 'video'>('image')
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<'post' | 'share' | null>(null)
  const [busySubAction, setBusySubAction] = useState<'processing' | 'uploading' | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [showSafeGuide, setShowSafeGuide] = useState(true)
  const [layout, setLayout] = useState('bottom-row')
  const [livePositions, setLivePositions] = useState<LivePositions>(DEFAULT_LIVE_POSITIONS)
  const [kcalEstimate, setKcalEstimate] = useState(0)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragRef = useRef({ key: null as string | null, pointerId: null as number | null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } })
  const [mediaLoadIdRef] = useState({ current: 0 })
  const backgroundUrlRef = useRef('')

  // Save-to-Photos panel (iOS fallback: long-press the image → "Adicionar à Fotos")
  const [saveImageUrl, setSaveImageUrl] = useState<string | null>(null)

  // Trimming State
  const [showTrimmer, setShowTrimmer] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 60])
  const [previewTime, setPreviewTime] = useState(0)

  useEffect(() => {
    backgroundUrlRef.current = backgroundUrl
  }, [backgroundUrl])

  // Compute Metrics
  const metrics: Metrics = useMemo(() => {
    const title = safeString(session?.workoutTitle || session?.name || 'Treino')
    const date = formatDatePt(session?.date || session?.completed_at || session?.completedAt || session?.created_at)
    const logs = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
    const volume = calculateTotalVolume(logs)
    const totalTime = Number(session?.totalTime) || 0
    const kcal = Number.isFinite(Number(kcalEstimate)) && Number(kcalEstimate) > 0 ? Number(kcalEstimate) : computeKcal({ session, volume })
    const teamObj = session?.team && typeof session.team === 'object' ? (session.team as Record<string, unknown>) : null
    const teamCountRaw = teamObj?.participantsCount ?? session?.teamParticipantsCount ?? session?.teamSessionParticipantsCount
    const teamCount = Number(teamCountRaw)
    return {
      title,
      date,
      volume,
      totalTime,
      kcal,
      teamCount: Number.isFinite(teamCount) ? teamCount : 0,
    }
  }, [session, kcalEstimate])

  // Fetch Kcal if needed
  useEffect(() => {
    if (!open) return
    if (!session) return
    let cancelled = false
      ; (async () => {
        try {
          const kcal = await getKcalEstimate({ session, workoutId: session?.id ?? null })
          if (cancelled) return
          if (Number.isFinite(Number(kcal)) && Number(kcal) > 0) setKcalEstimate(Math.round(Number(kcal)))
        } catch {
          // silent fail
        }
      })()
    return () => {
      cancelled = true
    }
  }, [open, session])

  // Pre-calculate sizes for LIVE layout interaction
  const liveSizes = useMemo(() => {
    try {
      if (typeof window === 'undefined') return computeLiveSizes({ ctx: null, metrics })
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      if (!ctx) return computeLiveSizes({ ctx: null, metrics })
      return computeLiveSizes({ ctx, metrics })
    } catch {
      return computeLiveSizes({ ctx: null, metrics })
    }
  }, [metrics])

  // Compositor Ref
  const compositorRef = useRef<VideoCompositor | null>(null)

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      if (compositorRef.current) {
        compositorRef.current.cancel()
        compositorRef.current = null
      }
      try {
        const url = String(backgroundUrlRef.current || '')
        if (url) URL.revokeObjectURL(url)
      } catch { }
      setBackgroundUrl('')
      setBackgroundImage(null)
      setSelectedFile(null)
      setMediaKind('image')
      setError('')
      setInfo('')
      setBusy(false)
      setBusyAction(null)
      setShowSafeGuide(true)
      setLivePositions(DEFAULT_LIVE_POSITIONS)
      setDraggingKey(null)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
      try {
        if (inputRef?.current) inputRef.current.value = ''
      } catch { }
      return
    }
    setError('')
    setInfo('')
    setBusy(false)
    setBusyAction(null)
    setBusySubAction(null)
    setShowSafeGuide(true)
    setLivePositions(DEFAULT_LIVE_POSITIONS)
    setDraggingKey(null)
    dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
    setSelectedFile(null)
    setMediaKind('image')
    setBackgroundUrl('')
    setBackgroundImage(null)
    setShowTrimmer(false)
    setVideoDuration(0)
    setTrimRange([0, 60])
    try {
      if (inputRef?.current) inputRef.current.value = ''
    } catch { }
  }, [open])

  // Lock scroll
  useEffect(() => {
    if (!open) return

    const scrollY = window.scrollY
    const originalStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.position = originalStyle.position
      document.body.style.top = originalStyle.top
      document.body.style.width = originalStyle.width
      document.body.style.overflow = originalStyle.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Prevent gestures
  useEffect(() => {
    if (!open) return
    const prevent = (e: Event) => {
      try {
        e.preventDefault()
      } catch {
      }
    }
    document.addEventListener('gesturestart', prevent, { passive: false })
    document.addEventListener('gesturechange', prevent, { passive: false })
    document.addEventListener('gestureend', prevent, { passive: false })
    return () => {
      document.removeEventListener('gesturestart', prevent)
      document.removeEventListener('gesturechange', prevent)
      document.removeEventListener('gestureend', prevent)
    }
  }, [open])

  // Cleanup blob
  useEffect(() => {
    return () => {
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
    }
  }, [backgroundUrl])

  const loadMedia = async (file: File | null) => {
    try {
      setError('')
      setInfo('')
      if (!file) return
      const loadId = (mediaLoadIdRef.current || 0) + 1
      mediaLoadIdRef.current = loadId
      const rawName = safeString(file?.name).toLowerCase()
      const ext = parseExt(rawName) || extFromMime(file?.type)
      const kind = guessMediaKind(file?.type, ext)
      if (kind !== 'image' && kind !== 'video') {
        setError('Formato não suportado. Use JPG/PNG ou MP4/MOV/WEBM.')
        return
      }
      if (kind === 'video' && (ext === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) {
        setError('Formato WEBM pode não rodar no Safari. Prefira MP4/MOV.')
        return
      }
      setInfo('Carregando mídia…')
      const url = URL.createObjectURL(file)
      try {
        if (backgroundUrl) URL.revokeObjectURL(backgroundUrl)
      } catch {
      }
      setSelectedFile(file)
      setMediaKind(kind)
      setBackgroundUrl(url)
      if (kind === 'video') {
        setBackgroundImage(null)
        setInfo('')

        // Load video metadata to set defaults
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.onloadedmetadata = () => {
          const dur = v.duration || 0
          setVideoDuration(dur)
          setTrimRange([0, Math.min(dur, 60)])
        }
        v.src = url
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      if (!open) return
      if (mediaLoadIdRef.current !== loadId) return
      setBackgroundImage(img)
      setInfo('')
    } catch {
      setError('Não foi possível carregar a mídia.')
      setInfo('')
    }
  }

  // --- Interaction (LIVE Layout) ---

  const getSizeForKey = (key: string) => {
    if (key === 'brand') return liveSizes?.brand ?? { w: 0.5, h: 0.05 }
    if (key === 'title') return liveSizes?.title ?? { w: 0.7, h: 0.08 }
    if (key === 'subtitle') return liveSizes?.subtitle ?? { w: 0.8, h: 0.05 }
    return liveSizes?.card ?? { w: 0.26, h: 0.08 }
  }

  const onPiecePointerDown = (key: string, e: React.PointerEvent<HTMLElement>) => {
    try {
      if (layout !== 'live') return
      if (!key) return
      if (!e?.currentTarget) return
      if (typeof e?.pointerId !== 'number') return
      e.preventDefault?.()
      e.stopPropagation?.()
      const startPos = livePositions?.[key] ?? DEFAULT_LIVE_POSITIONS?.[key] ?? { x: 0.1, y: 0.1 }
      dragRef.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPos }
      setDraggingKey(key)
      e.currentTarget?.setPointerCapture?.(e.pointerId)
    } catch {
    }
  }

  const onPiecePointerMove = (key: string, e: React.PointerEvent<HTMLElement>) => {
    try {
      if (layout !== 'live') return
      const activeKey = dragRef.current?.key
      const activePointerId = dragRef.current?.pointerId
      if (!activeKey || activeKey !== key) return
      if (typeof activePointerId !== 'number') return
      if (e?.pointerId !== activePointerId) return
      const preview = previewRef.current
      const rect = preview?.getBoundingClientRect?.()
      if (!rect?.width || !rect?.height) return
      e.preventDefault?.()
      e.stopPropagation?.()
      const dxPct = (Number(e.clientX) - Number(dragRef.current?.startX || 0)) / rect.width
      const dyPct = (Number(e.clientY) - Number(dragRef.current?.startY || 0)) / rect.height
      const startPos = dragRef.current?.startPos ?? { x: 0, y: 0 }
      const nextPos = { x: (Number(startPos.x) || 0) + dxPct, y: (Number(startPos.y) || 0) + dyPct }
      const size = getSizeForKey(key)
      const clamped = clampPctWithSize({ pos: nextPos, size })
      setLivePositions((prev) => ({ ...(prev ?? DEFAULT_LIVE_POSITIONS), [key]: clamped }))
    } catch {
    }
  }

  const onPiecePointerUp = (key: string, e: React.PointerEvent<HTMLElement>) => {
    try {
      const activeKey = dragRef.current?.key
      const activePointerId = dragRef.current?.pointerId
      if (!activeKey || activeKey !== key) return
      if (typeof activePointerId !== 'number') return
      if (e?.pointerId !== activePointerId) return
      e.preventDefault?.()
      e.stopPropagation?.()
      e.currentTarget?.releasePointerCapture?.(activePointerId)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
      setDraggingKey(null)
    } catch {
    }
  }

  const livePieces = useMemo(() => {
    return [
      { key: 'brand', label: 'IRONTRACKS' },
      { key: 'title', label: 'TREINO' },
      { key: 'subtitle', label: 'RELATÓRIO' },
      { key: 'cardVolume', label: 'VOLUME' },
      { key: 'cardTempo', label: 'TEMPO' },
      { key: 'cardKcal', label: 'KCAL' },
    ]
  }, [])

  const onSelectLayout = (nextLayout: string) => {
    try {
      const value = safeString(nextLayout)
      setLayout(value || 'bottom-row')
      setDraggingKey(null)
      dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
    } catch {
      setLayout('bottom-row')
    }
  }

  // Draw loop
  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // if (mediaKind === 'video') return // Removed to allow drawing overlay on video
    let raf = 0
    const draw = () => {
      drawStory({
        ctx,
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
        backgroundImage,
        metrics,
        layout,
        livePositions,
        transparentBg: mediaKind === 'video'
      })
    }
    if (isExporting) {
      draw()
      return
    }
    // Only animate if LIVE and dragging, otherwise draw once to save battery
    if (layout === 'live' && draggingKey) {
      raf = requestAnimationFrame(draw)
    } else {
      draw()
    }
    return () => cancelAnimationFrame(raf)
  }, [open, backgroundImage, layout, livePositions, mediaKind, metrics, draggingKey, isExporting])

  const renderVideo = async (): Promise<{ blob: Blob; filename: string; mime: string }> => {
    if (!videoRef.current) throw new Error('Vídeo não disponível')

    // Safari iOS não suporta canvas.captureStream() — exportar como imagem estática do frame atual
    if (!VideoCompositor.isSupported()) {
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_W
      canvas.height = CANVAS_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas_error')
      const vid = videoRef.current
      const vw = vid.videoWidth || CANVAS_W
      const vh = vid.videoHeight || CANVAS_H
      const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh)
      const dw = vw * scale
      const dh = vh * scale
      ctx.drawImage(vid, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh)
      drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null, metrics, layout, livePositions, transparentBg: true, skipClear: true })
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('blob_failed')), 'image/jpeg', 0.92)
      )
      return { blob, filename: `irontracks-story-${Date.now()}.jpg`, mime: 'image/jpeg' }
    }

    // Initialize compositor
    compositorRef.current = new VideoCompositor()
    setIsExporting(true)

    try {
      const result = await compositorRef.current.render({
        videoElement: videoRef.current,
        trimRange,
        outputWidth: CANVAS_W,
        outputHeight: CANVAS_H,
        fps: 30,
        onDrawFrame: (ctx, video) => {
          const vw = video.videoWidth
          const vh = video.videoHeight
          if (!vw || !vh) return

          const { scale } = fitCover({ canvasW: CANVAS_W, canvasH: CANVAS_H, imageW: vw, imageH: vh })
          const dw = vw * scale
          const dh = vh * scale
          const cx = (CANVAS_W - dw) / 2
          const cy = (CANVAS_H - dh) / 2

          ctx.drawImage(video, cx, cy, dw, dh)

          drawStory({
            ctx,
            canvasW: CANVAS_W,
            canvasH: CANVAS_H,
            backgroundImage: null,
            metrics,
            layout,
            livePositions,
            transparentBg: true,
            skipClear: true
          })
        }
      })
      return result
    } catch (e) {
      logError('error', 'Render failed', e)
      throw e
    } finally {
      compositorRef.current = null
      setIsExporting(false)
    }
  }

  const createImageBlob = async ({ type = 'jpg', quality = 0.95 }): Promise<{ blob: Blob; filename: string; mime: string }> => {
    if (mediaKind === 'video') {
      return renderVideo()
    }

    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_error')

    // If image is loaded, use it
    if (mediaKind === 'image') {
      // drawStory already handles this
    }

    drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: mediaKind === 'image' ? backgroundImage : null, metrics, layout, livePositions })

    // If video, we tried to draw the frame above.

    const mime = type === 'png' ? 'image/png' : 'image/jpeg'
    const ext = type === 'png' ? 'png' : 'jpg'
    const filename = `irontracks-story-${Date.now()}.${ext}`

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, filename, mime })
          else reject(new Error('blob_failed'))
        },
        mime,
        quality
      )
    })
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
      }
    }, 1000)
  }

  const shareImage = async () => {
    setBusy(true)
    setBusyAction('share')
    setBusySubAction('processing')
    setError('')
    setInfo('')
    try {
      const result = await Promise.race([
        createImageBlob({ type: 'jpg' }),
        new Promise<{ blob: Blob; filename: string; mime: string }>((_, reject) =>
          setTimeout(() => reject(new Error('timeout_rendering_5m')), 300000)
        )
      ])

      // ── iOS native (Capacitor): save directly to camera roll ──
      if (isIosNative()) {
        setBusySubAction('uploading')
        const isVideo = mediaKind === 'video'

        // Try file-path method first (faster — no base64 overhead)
        // This requires the native build with saveFileToPhotos support
        let saved = false
        try {
          const fileSave = await saveBlobToPhotos(result.blob, result.filename, isVideo)
          if (fileSave.saved) {
            saved = true
          } else if (fileSave.error === 'permissionDenied') {
            setError('Permissão de Fotos negada. Vá em Ajustes > IronTracks > Fotos.')
            await openAppSettings()
            return
          }
        } catch {
          // saveFileToPhotos not available in this native build — continue to base64 fallback
        }

        // Fallback: base64 method (always works on any native build)
        if (!saved) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataUrl = String(reader.result || '')
              const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
              if (b64) resolve(b64)
              else reject(new Error('base64_empty'))
            }
            reader.onerror = () => reject(new Error('reader_error'))
            reader.readAsDataURL(result.blob)
          })

          const saveResult = await saveImageToPhotos(base64)
          if (saveResult.saved) {
            saved = true
          } else if (saveResult.error === 'permissionDenied') {
            setError('Permissão de Fotos negada. Vá em Ajustes > IronTracks > Fotos.')
            await openAppSettings()
            return
          } else {
            logWarn('StoryComposer', 'Native save failed, trying share API', saveResult.error)
          }
        }

        if (saved) {
          setInfo(isVideo ? 'Vídeo salvo no rolo!' : 'Imagem salva no rolo!')
          return
        }
      }

      // ── Web Share API (iOS PWA / non-native / fallback) ──────────────────────
      const file = new File([result.blob], result.filename, { type: result.mime })
      const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
      const isIOS = isIOSUserAgent(ua) || isIosNative()

      let shared = false
      if (typeof navigator.share === 'function') {
        try {
          const shareData = { files: [file], title: 'Story IronTracks' }
          const canShare = navigator.canShare ? navigator.canShare(shareData) : true
          if (canShare) {
            await navigator.share(shareData)
            shared = true
            if (isIOS) {
              setInfo(mediaKind === 'video' ? 'Vídeo salvo no rolo!' : 'Imagem salva no rolo!')
            }
          }
        } catch (shareErr: unknown) {
          const name = String((shareErr as { name?: string })?.name || '').trim()
          if (name === 'AbortError') {
            setBusy(false)
            setBusyAction(null)
            return
          }
          logWarn('StoryComposer', 'Share API failed', shareErr)
        }
      }

      if (!shared) {
        if (isIOS) {
          // Last resort: show image full-screen (long-press may work in Safari PWA)
          const objUrl = URL.createObjectURL(result.blob)
          setSaveImageUrl(objUrl)
        } else {
          downloadBlob(result.blob, result.filename)
          setInfo(mediaKind === 'video' ? 'Vídeo salvo em Downloads!' : 'Imagem salva em Downloads!')
        }
      }
    } catch (e: unknown) {
      const name = String(e instanceof Error ? e.name : (e !== null && typeof e === 'object' ? (e as Record<string, unknown>).name : '')).trim()
      if (name === 'AbortError') return
      const msg = String(getErrorMessage(e) || '').trim()
      setError(msg || 'Não foi possível compartilhar.')
    } finally {
      setBusy(false)
      setBusyAction(null)
      setBusySubAction(null)
    }
  }

  const postToIronTracks = async () => {
    setBusy(true)
    setBusyAction('post')
    setBusySubAction('processing')
    setError('')
    setInfo('')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const uid = String(authData?.user?.id || '').trim()
      if (!uid) throw new Error('unauthorized')

      let path = ''
      let meta: Record<string, unknown> = {}

      if (mediaKind === 'video') {
        if (!selectedFile) throw new Error('Selecione um vídeo primeiro.')
        const maxBytes = 200 * 1024 * 1024
        if (Number(selectedFile.size) > maxBytes) throw new Error('Vídeo muito grande (máx 200MB).')

        // Renderiza vídeo com layout
        const { blob, mime } = await Promise.race([
          createImageBlob({}),
          new Promise<{ blob: Blob; mime: string }>((_, reject) =>
            setTimeout(() => reject(new Error('timeout_rendering_5m')), 300000)
          )
        ])
        if (blob.size > maxBytes) throw new Error('Vídeo renderizado muito grande (máx 200MB).')
        if (String(mime || '').toLowerCase().includes('webm')) {
          const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
          if (isIOSUserAgent(ua)) throw new Error('No iPhone, o vídeo com layout precisa ser MP4. Atualize o iOS/Safari ou poste via desktop.')
        }

        setBusySubAction('uploading')
        setUploadProgress(0)

        path = await uploadStoryMedia(blob, uid, mime, (uploaded: number, total: number) => {
          if (total > 0) setUploadProgress(Math.round((uploaded / total) * 100))
        })
        setUploadProgress(100)

        meta = {
          title: String(metrics?.title || ''),
          dateText: String(metrics?.date || ''),
          durationSeconds: Number(metrics?.totalTime || 0),
          totalVolumeKg: Number(metrics?.volume || 0),
          kcal: Number(metrics?.kcal || 0),
          layout: String(layout || ''),
          mediaKind: 'video',
        }
      } else {
        // Image
        const result = await createImageBlob({ type: 'jpg', quality: 0.92 })

        setBusySubAction('uploading')
        setUploadProgress(0)

        path = await uploadStoryMedia(result.blob, uid, result.mime, (uploaded: number, total: number) => {
          if (total > 0) setUploadProgress(Math.round((uploaded / total) * 100))
        })
        setUploadProgress(100)
        meta = {
          title: String(metrics?.title || ''),
          dateText: String(metrics?.date || ''),
          durationSeconds: Number(metrics?.totalTime || 0),
          totalVolumeKg: Number(metrics?.volume || 0),
          kcal: Number(metrics?.kcal || 0),
          layout: String(layout || ''),
          mediaKind: 'image',
        }
      }

      const createUrl = isIosNative() ? `/api/social/stories/create?media_path=${encodeURIComponent(path)}` : '/api/social/stories/create'
      const fetchController = new AbortController()
      const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000)
      let createResp: Response
      try {
        createResp = await fetch(createUrl, {
          method: 'POST',
          signal: fetchController.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mediaPath: path, media_path: path, caption: String(metrics?.title || ''), meta }),
        })
      } finally {
        clearTimeout(fetchTimeout)
      }
      const createJson = await createResp.json().catch((): null => null)
      if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))

      setInfo('Publicado no IronTracks!')
      try {
        window.dispatchEvent(new Event('irontracks:stories:refresh'))
      } catch {
      }
      try {
        window.setTimeout(() => onClose?.(), 1000)
      } catch { }

    } catch (err: unknown) {
      logError('error', err)
      const msg = String(getErrorMessage(err) || '').trim()
      setError(msg || 'Falha ao publicar story.')
    } finally {
      setBusy(false)
      setBusyAction(null)
      setBusySubAction(null)
      setUploadProgress(0)
    }
  }

  if (!open) return null

  const isVideo = mediaKind === 'video'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center sm:p-4 pt-safe pb-safe"
        >
          {/* Mobile Header / Close */}
          <div className="flex-none px-4 pb-4 pt-14 flex justify-between items-start w-full max-w-md mx-auto sm:hidden bg-gradient-to-b from-black/60 to-transparent border-b border-yellow-500/10">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="font-black text-lg truncate leading-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{metrics.title || 'Story Composer'}</h3>
              <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SUA CONQUISTA</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-800/80 border border-neutral-700/50 text-neutral-400 flex items-center justify-center hover:bg-neutral-700 transition-colors flex-none"
            >
              <X size={16} />
            </button>
          </div>

          <motion.div
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.95 }}
            className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-black sm:bg-neutral-900 sm:border border-neutral-800 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Desktop Header */}
            <div className="hidden sm:flex px-6 py-5 border-b border-yellow-500/10 items-center justify-between flex-none bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-900">
              <div>
                <h2 className="font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">{metrics.title || 'Story Composer'}</h2>
                <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-[0.2em] mt-1">COMPARTILHE SUA CONQUISTA</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700/50 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div ref={scrollAreaRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-black sm:bg-transparent">
              <div className="p-4 sm:p-8 flex flex-col lg:flex-row gap-8 h-full max-w-5xl mx-auto items-center lg:items-start">

                {/* Preview Column */}
                <div className="flex-none flex flex-col items-center gap-6">
                  <div
                    ref={previewRef}
                    className="relative w-full max-w-[300px] sm:max-w-[340px] aspect-[9/16] rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl ring-1 ring-white/10 shrink-0"
                  >
                    {isVideo && (
                      <video
                        key={backgroundUrl || 'no-video'}
                        ref={videoRef}
                        crossOrigin="anonymous"
                        src={backgroundUrl || undefined}
                        className="absolute inset-0 w-full h-full object-cover bg-black"
                        controls={false}
                        playsInline
                        muted
                        autoPlay
                        loop
                      />
                    )}

                    <canvas
                      ref={previewCanvasRef}
                      width={CANVAS_W}
                      height={CANVAS_H}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />

                    {showSafeGuide && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        {/* Top safe-zone band line — mimics Instagram's upper guideline */}
                        <div
                          className="absolute left-0 right-0 h-px bg-yellow-400/40"
                          style={{ top: `${(SAFE_TOP / CANVAS_H) * 100}%` }}
                        />
                        {/* Bottom safe-zone band line */}
                        <div
                          className="absolute left-0 right-0 h-px bg-yellow-400/40"
                          style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }}
                        />
                        {/* Side safe zone lines */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-yellow-400/20"
                          style={{ left: `${(SAFE_SIDE / CANVAS_W) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-px bg-yellow-400/20"
                          style={{ right: `${(SAFE_SIDE / CANVAS_W) * 100}%` }}
                        />
                        {/* Safe area shaded overlays (top/bottom unsafe zones) */}
                        <div
                          className="absolute left-0 right-0 top-0 bg-black/25"
                          style={{ height: `${(SAFE_TOP / CANVAS_H) * 100}%` }}
                        />
                        <div
                          className="absolute left-0 right-0 bottom-0 bg-black/25"
                          style={{ height: `${(SAFE_BOTTOM / CANVAS_H) * 100}%` }}
                        />
                        {/* Label: top */}
                        <div
                          className="absolute left-0 right-0 flex items-center justify-center"
                          style={{ top: `${(SAFE_TOP / CANVAS_H) * 100 - 5}%` }}
                        >
                          <span className="text-[7px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">
                            SAFE TOP
                          </span>
                        </div>
                        {/* Label: bottom */}
                        <div
                          className="absolute left-0 right-0 flex items-center justify-center"
                          style={{ bottom: `${(SAFE_BOTTOM / CANVAS_H) * 100 - 5}%` }}
                        >
                          <span className="text-[7px] font-black uppercase tracking-widest text-yellow-400/60 bg-black/40 px-1.5 py-0.5 rounded-full">
                            SAFE BOTTOM
                          </span>
                        </div>
                      </div>
                    )}


                    {layout === 'live' && (
                      <div className="absolute inset-0 pointer-events-none z-20">
                        {livePieces.map((p) => {
                          const pos = livePositions?.[p.key] ?? DEFAULT_LIVE_POSITIONS?.[p.key] ?? { x: 0.1, y: 0.1 }
                          const isDragging = draggingKey === p.key
                          return (
                            <button
                              key={p.key}
                              type="button"
                              className={[
                                'absolute pointer-events-auto select-none touch-none',
                                'px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-transform active:scale-110',
                                isDragging
                                  ? 'bg-yellow-500 text-black border-yellow-500 shadow-lg scale-110 z-50'
                                  : 'bg-black/60 backdrop-blur text-white border-white/20 hover:border-yellow-500/50',
                              ].join(' ')}
                              style={{
                                left: `${clamp01(pos.x) * 100}%`,
                                top: `${clamp01(pos.y) * 100}%`,
                                cursor: 'grab'
                              }}
                              onPointerDown={(e) => onPiecePointerDown(p.key, e)}
                              onPointerMove={(e) => onPiecePointerMove(p.key, e)}
                              onPointerUp={(e) => onPiecePointerUp(p.key, e)}
                              onPointerCancel={(e) => onPiecePointerUp(p.key, e)}
                            >
                              {p.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Media Controls */}
                  <div className="w-full max-w-[300px] sm:max-w-[340px] flex items-center gap-3">
                    <label
                      className={[
                        'flex-1 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-800 hover:border-neutral-700 inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]',
                        busy ? 'opacity-50 pointer-events-none' : '',
                      ].join(' ')}
                    >
                      <Upload size={16} className="text-yellow-500" />
                      {isVideo ? 'TROCAR' : 'TROCAR FOTO'}
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null
                          if (inputRef.current) inputRef.current.value = ''
                          loadMedia(f)
                        }}
                      />
                    </label>

                    {isVideo && (
                      <button
                        type="button"
                        onClick={() => setShowTrimmer(v => !v)}
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors active:scale-[0.98] ${showTrimmer
                          ? 'bg-yellow-500 text-black border-yellow-500'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        disabled={busy}
                      >
                        <Scissors size={18} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowSafeGuide((v) => !v)}
                      className={`w-28 h-12 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-colors active:scale-[0.98] ${showSafeGuide
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      disabled={busy}
                    >
                      GUIA {showSafeGuide ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Controls Column */}
                <div className="flex-1 w-full max-w-[360px] flex flex-col gap-6">

                  {/* Trimmer UI */}
                  <AnimatePresence>
                    {showTrimmer && isVideo && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <VideoTrimmer
                          duration={videoDuration}
                          value={trimRange}
                          onChange={(val) => {
                            setTrimRange(val)
                            // Update preview frame if paused
                            if (videoRef.current && videoRef.current.paused) {
                              videoRef.current.currentTime = val[0]
                            }
                          }}
                          onPreview={(play) => {
                            if (!videoRef.current) return
                            if (play) {
                              videoRef.current.currentTime = trimRange[0]
                              videoRef.current.play()
                              const check = () => {
                                if (!videoRef.current) return
                                setPreviewTime(videoRef.current.currentTime)
                                if (videoRef.current.currentTime >= trimRange[1]) {
                                  videoRef.current.pause()
                                  videoRef.current.currentTime = trimRange[0]
                                } else if (!videoRef.current.paused) {
                                  requestAnimationFrame(check)
                                }
                              }
                              requestAnimationFrame(check)
                            } else {
                              videoRef.current.pause()
                            }
                          }}
                          currentTime={previewTime}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Layout Selector */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/80 mb-2">
                      <Layout size={14} />
                      ESCOLHA O LAYOUT
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {STORY_LAYOUTS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => onSelectLayout(l.id)}
                          className={[
                            'h-12 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.98]',
                            layout === l.id
                              ? 'bg-white text-black border-white shadow-lg scale-[1.02]'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700',
                            l.id === 'live' ? 'col-span-2' : '' // LIVE spans full width
                          ].join(' ')}
                          disabled={busy}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                    {layout === 'live' && (
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 mt-2">
                        <Move size={16} className="text-blue-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs text-blue-200 font-medium">Modo LIVE ativado</p>
                          <p className="text-[10px] text-blue-300/70 mt-1">Arraste os elementos na pré-visualização para personalizar.</p>
                        </div>
                        <button
                          onClick={() => setLivePositions(DEFAULT_LIVE_POSITIONS)}
                          className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-300"
                          title="Resetar posições"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 hidden lg:block" />

                  {/* Status Messages */}
                  <AnimatePresence mode="wait">
                    {info && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-200">{info}</p>
                      </motion.div>
                    )}
                    {error && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 flex items-center gap-3">
                        <AlertCircle size={18} className="text-red-400" />
                        <p className="text-xs font-bold text-red-200">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions */}
                  <div className="space-y-3 pt-2">
                    {/* Primary: Post */}
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 rounded-2xl opacity-60 group-hover:opacity-100 blur-sm transition-opacity" />
                      <button
                        onClick={postToIronTracks}
                        disabled={busy}
                        aria-label="Postar story no IronTracks"
                        aria-busy={busyAction === 'post'}
                        className="relative h-14 w-full rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 hover:from-yellow-400 hover:via-amber-300 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all active:scale-[0.97]"
                      >
                        {busyAction === 'post' ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            <span>{busySubAction === 'processing' ? 'PROCESSANDO...' : 'ENVIANDO...'}</span>
                          </>
                        ) : (
                          <>
                            <Crown size={18} strokeWidth={2.5} />
                            <span>POSTAR NO IRONTRACKS</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Upload progress bar */}
                    {busyAction === 'post' && busySubAction === 'uploading' && (
                      <div className="space-y-1.5" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do upload">
                        <div className="w-full bg-neutral-800/80 rounded-full h-2 overflow-hidden border border-neutral-700/50">
                          <div
                            className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-yellow-500/70 text-right font-mono font-bold">{uploadProgress}%</p>
                      </div>
                    )}

                    {/* Secondary: Download / Share */}
                    <button
                      onClick={shareImage}
                      disabled={busy}
                      className="relative h-12 w-full rounded-xl bg-neutral-900/80 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-neutral-700/50 hover:border-yellow-500/30 transition-all active:scale-[0.97] overflow-hidden"
                    >
                      {busyAction === 'share' ? (
                        <>
                          {/* Progress bar background inside button */}
                          <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-amber-500/15 to-yellow-500/10 transition-all duration-300" />
                          <div className="relative flex items-center gap-2">
                            <Loader2 className="animate-spin text-yellow-500" size={16} />
                            <span className="text-yellow-500">{busySubAction === 'processing' ? 'PROCESSANDO...' : 'SALVANDO...'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Download size={15} className="text-yellow-500/70" />
                          <span>BAIXAR / COMPARTILHAR</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <StoryComposerIosSavePanel
        saveImageUrl={saveImageUrl}
        onClose={() => setSaveImageUrl(null)}
      />
    </AnimatePresence>
  )
}
