'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getKcalEstimate } from '@/utils/calories/kcalClient'
import { estimateCaloriesMet } from '@/utils/calories/metEstimate'
import { VideoCompositor } from '@/lib/video/VideoCompositor'
import { getErrorMessage } from '@/utils/errorMessage'
import { isIosNative } from '@/utils/platform'
import { safeString } from '@/utils/guards'
import { saveImageToPhotos, saveBlobToPhotos, openAppSettings } from '@/utils/native/irontracksNative'
import { uploadStoryMedia } from '@/utils/storage/mediaUpload'
import { logError, logWarn } from '@/lib/logger'
import {
    SessionLite,
    Metrics,
    LivePositions,
    CANVAS_W,
    CANVAS_H,
    DEFAULT_LIVE_POSITIONS,
    isIOSUserAgent,
    parseExt,
    extFromMime,
    guessMediaKind,
    formatDatePt,
    formatDuration,
    calculateTotalVolume,
    fitCover,
    clampPctWithSize,
    computeLiveSizes,
    drawStory,
} from '../storyComposerUtils'

interface UseStoryComposerOptions {
    open: boolean
    session: SessionLite
    onClose: () => void
}

export function useStoryComposer({ open, session, onClose }: UseStoryComposerOptions) {
    const inputRef = useRef<HTMLInputElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const compositorRef = useRef<VideoCompositor | null>(null)
    const dragRef = useRef({ key: null as string | null, pointerId: null as number | null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } })
    const [mediaLoadIdRef] = useState({ current: 0 })
    const backgroundUrlRef = useRef('')

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
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const [saveImageUrl, setSaveImageUrl] = useState<string | null>(null)
    const [showTrimmer, setShowTrimmer] = useState(false)
    const [videoDuration, setVideoDuration] = useState(0)
    const [trimRange, setTrimRange] = useState<[number, number]>([0, 60])
    const [previewTime, setPreviewTime] = useState(0)
    // Fire-and-forget API ref (logging only — does NOT drive the displayed kcal)
    const kcalApiCalledRef = useRef(false)

    useEffect(() => { backgroundUrlRef.current = backgroundUrl }, [backgroundUrl])

    const metrics: Metrics = useMemo(() => {
        const title = safeString(session?.workoutTitle || session?.name || 'Treino')
        const date = formatDatePt(session?.date || session?.completed_at || session?.completedAt || session?.created_at)
        const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : {}
        const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
        const volume = calculateTotalVolume(logs)
        const totalTime = Number(s?.totalTime) || 0

        // ── Extract preCheckin body weight (same priority as useReportData) ──
        const preCheckin = s?.preCheckin && typeof s.preCheckin === 'object' ? (s.preCheckin as Record<string, unknown>) : null
        const preCheckinAnswers = preCheckin?.answers && typeof preCheckin.answers === 'object' ? (preCheckin.answers as Record<string, unknown>) : null
        const bodyWeightKg = (() => {
            const candidates = [
                preCheckinAnswers?.body_weight_kg,
                preCheckin?.body_weight_kg,
                preCheckin?.weight,
            ]
            for (const c of candidates) {
                const n = Number(c)
                if (Number.isFinite(n) && n >= 20 && n <= 300) return n
            }
            return null
        })()

        // ── Extract post-checkin RPE ──────────────────────────────────────────
        const postCheckin = s?.postCheckin && typeof s.postCheckin === 'object' ? (s.postCheckin as Record<string, unknown>) : null
        const postCheckinAnswers = postCheckin?.answers && typeof postCheckin.answers === 'object' ? (postCheckin.answers as Record<string, unknown>) : null
        const rpe = (() => {
            const rpeRaw = postCheckinAnswers?.rpe ?? postCheckin?.rpe
            const n = Number(rpeRaw)
            return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null
        })()

        // ── Extract exercise names (complexity factor) ────────────────────────
        const exerciseNames = Array.isArray(s?.exercises)
            ? (s.exercises as unknown[]).map((ex) => {
                const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
                return String(e?.name || '').trim()
            }).filter(Boolean) as string[]
            : null

        // ── Prefer explicit exec/rest seconds from session ────────────────────
        const execSeconds = Number(s?.executionTotalSeconds ?? s?.execution_total_seconds ?? 0) || 0
        const restSeconds = Number(s?.restTotalSeconds ?? s?.rest_total_seconds ?? 0) || 0
        const execMinutesOverride = execSeconds > 0 ? execSeconds / 60 : null
        const restMinutesOverride = restSeconds > 0 ? restSeconds / 60 : null
        const durationMinutes = totalTime / 60

        // ── Calculate kcal using the same estimator as the report ─────────────
        const kcal = estimateCaloriesMet(
            logs,
            durationMinutes,
            bodyWeightKg,
            exerciseNames,
            rpe,
            execMinutesOverride,
            restMinutesOverride,
        )

        const teamObj = s?.team && typeof s.team === 'object' ? (s.team as Record<string, unknown>) : null
        const teamCountRaw = teamObj?.participantsCount ?? s?.teamParticipantsCount ?? s?.teamSessionParticipantsCount
        const teamCount = Number(teamCountRaw)
        return { title, date, volume, totalTime, kcal, teamCount: Number.isFinite(teamCount) ? teamCount : 0 }
    }, [session])

    // ── Fire-and-forget: API call for server logging only (does NOT drive displayed kcal) ──
    useEffect(() => {
        if (!open || !session || kcalApiCalledRef.current) return
        kcalApiCalledRef.current = true
        getKcalEstimate({ session, workoutId: session?.id ?? null }).catch(() => {})
    }, [open, session])

    const liveSizes = useMemo(() => {
        try {
            if (typeof window === 'undefined') return computeLiveSizes({ ctx: null, metrics })
            const c = document.createElement('canvas')
            const ctx = c.getContext('2d')
            if (!ctx) return computeLiveSizes({ ctx: null, metrics })
            return computeLiveSizes({ ctx, metrics })
        } catch { return computeLiveSizes({ ctx: null, metrics }) }
    }, [metrics])

    const resetState = useCallback((isClose: boolean) => {
        if (isClose && compositorRef.current) {
            compositorRef.current.cancel()
            compositorRef.current = null
        }
        if (isClose) {
            try { const url = String(backgroundUrlRef.current || ''); if (url) URL.revokeObjectURL(url) } catch { }
        }
        setBackgroundUrl('')
        setBackgroundImage(null)
        setSelectedFile(null)
        setMediaKind('image')
        setError('')
        setInfo('')
        setBusy(false)
        setBusyAction(null)
        setBusySubAction(null)
        setShowSafeGuide(true)
        setLivePositions(DEFAULT_LIVE_POSITIONS)
        setDraggingKey(null)
        dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
        if (!isClose) {
            setShowTrimmer(false)
            setVideoDuration(0)
            setTrimRange([0, 60])
        }
        try { if (inputRef?.current) inputRef.current.value = '' } catch { }
    }, [])

    useEffect(() => { resetState(!open) }, [open, resetState])

    useEffect(() => {
        if (!open) return
        const scrollY = window.scrollY
        const orig = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow }
        document.body.style.position = 'fixed'
        document.body.style.top = `-${scrollY}px`
        document.body.style.width = '100%'
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.position = orig.position
            document.body.style.top = orig.top
            document.body.style.width = orig.width
            document.body.style.overflow = orig.overflow
            window.scrollTo(0, scrollY)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const prevent = (e: Event) => { try { e.preventDefault() } catch { } }
        document.addEventListener('gesturestart', prevent, { passive: false })
        document.addEventListener('gesturechange', prevent, { passive: false })
        document.addEventListener('gestureend', prevent, { passive: false })
        return () => {
            document.removeEventListener('gesturestart', prevent)
            document.removeEventListener('gesturechange', prevent)
            document.removeEventListener('gestureend', prevent)
        }
    }, [open])

    useEffect(() => { return () => { try { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl) } catch { } } }, [backgroundUrl])

    const loadMedia = useCallback(async (file: File | null) => {
        try {
            setError('')
            setInfo('')
            if (!file) return
            const loadId = (mediaLoadIdRef.current || 0) + 1
            mediaLoadIdRef.current = loadId
            const rawName = safeString(file?.name).toLowerCase()
            const ext = parseExt(rawName) || extFromMime(file?.type)
            const kind = guessMediaKind(file?.type, ext)
            if (kind !== 'image' && kind !== 'video') { setError('Formato não suportado. Use JPG/PNG ou MP4/MOV/WEBM.'); return }
            if (kind === 'video' && (ext === '.webm' || String(file?.type || '').toLowerCase() === 'video/webm')) { setError('Formato WEBM pode não rodar no Safari. Prefira MP4/MOV.'); return }
            setInfo('Carregando mídia…')
            const url = URL.createObjectURL(file)
            try { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl) } catch { }
            setSelectedFile(file)
            setMediaKind(kind)
            setBackgroundUrl(url)
            if (kind === 'video') {
                setBackgroundImage(null)
                setInfo('')
                const v = document.createElement('video')
                v.preload = 'metadata'
                v.onloadedmetadata = () => { const dur = v.duration || 0; setVideoDuration(dur); setTrimRange([0, Math.min(dur, 60)]) }
                v.src = url
                return
            }
            const img = new Image()
            img.crossOrigin = 'anonymous'
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
            if (!open) return
            if (mediaLoadIdRef.current !== loadId) return
            setBackgroundImage(img)
            setInfo('')
        } catch { setError('Não foi possível carregar a mídia.'); setInfo('') }
    }, [open, backgroundUrl])

    // Live layout drag handlers
    const getSizeForKey = useCallback((key: string) => {
        if (key === 'brand') return liveSizes?.brand ?? { w: 0.5, h: 0.05 }
        if (key === 'title') return liveSizes?.title ?? { w: 0.7, h: 0.08 }
        if (key === 'subtitle') return liveSizes?.subtitle ?? { w: 0.8, h: 0.05 }
        return liveSizes?.card ?? { w: 0.26, h: 0.08 }
    }, [liveSizes])

    const onPiecePointerDown = useCallback((key: string, e: React.PointerEvent<HTMLElement>) => {
        try {
            if (layout !== 'live' || !key || !e?.currentTarget || typeof e?.pointerId !== 'number') return
            e.preventDefault?.(); e.stopPropagation?.()
            const startPos = livePositions?.[key] ?? DEFAULT_LIVE_POSITIONS?.[key] ?? { x: 0.1, y: 0.1 }
            dragRef.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPos }
            setDraggingKey(key)
            e.currentTarget?.setPointerCapture?.(e.pointerId)
        } catch { }
    }, [layout, livePositions])

    const onPiecePointerMove = useCallback((key: string, e: React.PointerEvent<HTMLElement>, previewRect: DOMRect | null) => {
        try {
            if (layout !== 'live') return
            const activeKey = dragRef.current?.key
            const activePointerId = dragRef.current?.pointerId
            if (!activeKey || activeKey !== key || typeof activePointerId !== 'number' || e?.pointerId !== activePointerId) return
            if (!previewRect?.width || !previewRect?.height) return
            e.preventDefault?.(); e.stopPropagation?.()
            const dxPct = (Number(e.clientX) - Number(dragRef.current?.startX || 0)) / previewRect.width
            const dyPct = (Number(e.clientY) - Number(dragRef.current?.startY || 0)) / previewRect.height
            const startPos = dragRef.current?.startPos ?? { x: 0, y: 0 }
            const nextPos = { x: (Number(startPos.x) || 0) + dxPct, y: (Number(startPos.y) || 0) + dyPct }
            const clamped = clampPctWithSize({ pos: nextPos, size: getSizeForKey(key) })
            setLivePositions((prev) => ({ ...(prev ?? DEFAULT_LIVE_POSITIONS), [key]: clamped }))
        } catch { }
    }, [layout, getSizeForKey])

    const onPiecePointerUp = useCallback((key: string, e: React.PointerEvent<HTMLElement>) => {
        try {
            const activeKey = dragRef.current?.key
            const activePointerId = dragRef.current?.pointerId
            if (!activeKey || activeKey !== key || typeof activePointerId !== 'number' || e?.pointerId !== activePointerId) return
            e.preventDefault?.(); e.stopPropagation?.()
            e.currentTarget?.releasePointerCapture?.(activePointerId)
            dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
            setDraggingKey(null)
        } catch { }
    }, [])

    const onSelectLayout = useCallback((nextLayout: string) => {
        try {
            setLayout(safeString(nextLayout) || 'bottom-row')
            setDraggingKey(null)
            dragRef.current = { key: null, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } }
        } catch { setLayout('bottom-row') }
    }, [])

    // Canvas helpers
    const renderVideoFrameAsJpeg = async (vid: HTMLVideoElement): Promise<{ blob: Blob; filename: string; mime: string }> => {
        const canvas = document.createElement('canvas')
        canvas.width = CANVAS_W; canvas.height = CANVAS_H
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas_error')
        const vw = vid.videoWidth || CANVAS_W; const vh = vid.videoHeight || CANVAS_H
        const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh)
        ctx.drawImage(vid, (CANVAS_W - vw * scale) / 2, (CANVAS_H - vh * scale) / 2, vw * scale, vh * scale)
        drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null, metrics, layout, livePositions, transparentBg: true, skipClear: true })
        return new Promise<{ blob: Blob; filename: string; mime: string }>((resolve, reject) =>
            canvas.toBlob(b => b ? resolve({ blob: b, filename: `irontracks-story-${Date.now()}.jpg`, mime: 'image/jpeg' }) : reject(new Error('blob_failed')), 'image/jpeg', 0.92)
        )
    }

    const renderVideo = async (): Promise<{ blob: Blob; filename: string; mime: string }> => {
        const vid = videoRef.current
        if (!vid) throw new Error('Vídeo não disponível')
        if (!VideoCompositor.isSupported()) return renderVideoFrameAsJpeg(vid)
        compositorRef.current = new VideoCompositor()
        setIsExporting(true)
        try {
            const renderPromise = compositorRef.current.render({
                videoElement: vid, trimRange, outputWidth: CANVAS_W, outputHeight: CANVAS_H, fps: 30,
                onDrawFrame: (ctx, video) => {
                    const vw = video.videoWidth; const vh = video.videoHeight
                    if (!vw || !vh) return
                    const { scale } = fitCover({ canvasW: CANVAS_W, canvasH: CANVAS_H, imageW: vw, imageH: vh })
                    const dw = vw * scale; const dh = vh * scale
                    ctx.drawImage(video, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh)
                    drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: null, metrics, layout, livePositions, transparentBg: true, skipClear: true })
                }
            })
            const result = await Promise.race([renderPromise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('render_timeout_60s')), 60_000))])
            if (!result.blob || result.blob.size === 0) { logWarn('StoryComposer', 'Empty blob, falling back to JPEG'); throw new Error('empty_blob') }
            return result
        } catch (e) {
            try { compositorRef.current?.cancel() } catch { }
            logWarn('StoryComposer', 'Video render failed, falling back to JPEG', e)
            try { const fallback = await renderVideoFrameAsJpeg(vid); setInfo('Exportação de vídeo não disponível. Imagem salva com o relatório.'); return fallback }
            catch (fallbackErr) { logError('error', 'JPEG fallback also failed', fallbackErr); throw e }
        } finally { compositorRef.current = null; setIsExporting(false) }
    }

    const createImageBlob = async ({ type = 'jpg', quality = 0.95 } = {}): Promise<{ blob: Blob; filename: string; mime: string }> => {
        if (mediaKind === 'video') return renderVideo()
        const canvas = document.createElement('canvas')
        canvas.width = CANVAS_W; canvas.height = CANVAS_H
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas_error')
        drawStory({ ctx, canvasW: CANVAS_W, canvasH: CANVAS_H, backgroundImage: mediaKind === 'image' ? backgroundImage : null, metrics, layout, livePositions })
        const mime = type === 'png' ? 'image/png' : 'image/jpeg'
        const ext = type === 'png' ? 'png' : 'jpg'
        return new Promise((resolve, reject) =>
            canvas.toBlob(blob => blob ? resolve({ blob, filename: `irontracks-story-${Date.now()}.${ext}`, mime }) : reject(new Error('blob_failed')), mime, quality)
        )
    }

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => { try { URL.revokeObjectURL(url) } catch { } }, 1000)
    }

    const shareImage = useCallback(async () => {
        setBusy(true); setBusyAction('share'); setBusySubAction('processing'); setError(''); setInfo('')
        try {
            const result = await Promise.race([createImageBlob({ type: 'jpg' }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout_rendering_5m')), 300000))])
            if (isIosNative()) {
                setBusySubAction('uploading')
                const isVideo = mediaKind === 'video'
                let saved = false
                try {
                    const fileSave = await saveBlobToPhotos(result.blob, result.filename, isVideo)
                    if (fileSave.saved) { saved = true }
                    else if (fileSave.error === 'permissionDenied') { setError('Permissão de Fotos negada. Vá em Ajustes > IronTracks > Fotos.'); await openAppSettings(); return }
                } catch { }
                if (!saved) {
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => { const dataUrl = String(reader.result || ''); const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl; if (b64) resolve(b64); else reject(new Error('base64_empty')) }
                        reader.onerror = () => reject(new Error('reader_error'))
                        reader.readAsDataURL(result.blob)
                    })
                    const saveResult = await saveImageToPhotos(base64)
                    if (saveResult.saved) { saved = true }
                    else if (saveResult.error === 'permissionDenied') { setError('Permissão de Fotos negada. Vá em Ajustes > IronTracks > Fotos.'); await openAppSettings(); return }
                    else { logWarn('StoryComposer', 'Native save failed', saveResult.error) }
                }
                if (saved) { setInfo(isVideo ? 'Vídeo salvo no rolo!' : 'Imagem salva no rolo!'); return }
            }
            const file = new File([result.blob], result.filename, { type: result.mime })
            const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
            const isIOS = isIOSUserAgent(ua) || isIosNative()
            let shared = false
            if (typeof navigator.share === 'function') {
                try {
                    const shareData = { files: [file], title: 'Story IronTracks' }
                    const canShare = navigator.canShare ? navigator.canShare(shareData) : true
                    if (canShare) { await navigator.share(shareData); shared = true; if (isIOS) setInfo(mediaKind === 'video' ? 'Vídeo salvo no rolo!' : 'Imagem salva no rolo!') }
                } catch (shareErr: unknown) {
                    const name = String((shareErr as { name?: string })?.name || '').trim()
                    if (name === 'AbortError') { setBusy(false); setBusyAction(null); return }
                    logWarn('StoryComposer', 'Share API failed', shareErr)
                }
            }
            if (!shared) {
                if (isIOS) { setSaveImageUrl(URL.createObjectURL(result.blob)) }
                else { downloadBlob(result.blob, result.filename); setInfo(mediaKind === 'video' ? 'Vídeo salvo em Downloads!' : 'Imagem salva em Downloads!') }
            }
        } catch (e: unknown) {
            const name = String(e instanceof Error ? e.name : (e !== null && typeof e === 'object' ? (e as Record<string, unknown>).name : '')).trim()
            if (name === 'AbortError') return
            setError(String(getErrorMessage(e) || '').trim() || 'Não foi possível compartilhar.')
        } finally { setBusy(false); setBusyAction(null); setBusySubAction(null) }
    }, [mediaKind, metrics, layout, livePositions, backgroundImage]) // eslint-disable-line

    const postToIronTracks = useCallback(async () => {
        setBusy(true); setBusyAction('post'); setBusySubAction('processing'); setError(''); setInfo('')
        try {
            const supabase = createClient()
            const { data: authData } = await supabase.auth.getUser()
            const uid = String(authData?.user?.id || '').trim()
            if (!uid) throw new Error('unauthorized')
            const maxBytes = 200 * 1024 * 1024
            let path = ''
            let meta: Record<string, unknown> = {}
            const metaBase = { title: String(metrics?.title || ''), dateText: String(metrics?.date || ''), durationSeconds: Number(metrics?.totalTime || 0), totalVolumeKg: Number(metrics?.volume || 0), kcal: Number(metrics?.kcal || 0), layout: String(layout || '') }
            if (mediaKind === 'video') {
                if (!selectedFile) throw new Error('Selecione um vídeo primeiro.')
                if (Number(selectedFile.size) > maxBytes) throw new Error('Vídeo muito grande (máx 200MB).')
                const { blob, mime } = await Promise.race([createImageBlob({}), new Promise<{ blob: Blob; mime: string }>((_, reject) => setTimeout(() => reject(new Error('timeout_rendering_5m')), 300000))])
                if (blob.size > maxBytes) throw new Error('Vídeo renderizado muito grande (máx 200MB).')
                if (String(mime || '').toLowerCase().includes('webm')) {
                    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
                    if (isIOSUserAgent(ua)) throw new Error('No iPhone, o vídeo com layout precisa ser MP4.')
                }
                setBusySubAction('uploading'); setUploadProgress(0)
                path = await uploadStoryMedia(blob, uid, mime, (uploaded: number, total: number) => { if (total > 0) setUploadProgress(Math.round((uploaded / total) * 100)) })
                setUploadProgress(100)
                meta = { ...metaBase, mediaKind: 'video' }
            } else {
                const result = await createImageBlob({ type: 'jpg', quality: 0.92 })
                setBusySubAction('uploading'); setUploadProgress(0)
                path = await uploadStoryMedia(result.blob, uid, result.mime, (uploaded: number, total: number) => { if (total > 0) setUploadProgress(Math.round((uploaded / total) * 100)) })
                setUploadProgress(100)
                meta = { ...metaBase, mediaKind: 'image' }
            }
            const createUrl = isIosNative() ? `/api/social/stories/create?media_path=${encodeURIComponent(path)}` : '/api/social/stories/create'
            const fetchController = new AbortController()
            const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000)
            let createResp: Response
            try {
                createResp = await fetch(createUrl, { method: 'POST', signal: fetchController.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mediaPath: path, media_path: path, caption: String(metrics?.title || ''), meta }) })
            } finally { clearTimeout(fetchTimeout) }
            const createJson = await createResp.json().catch((): null => null)
            if (!createResp.ok || !createJson?.ok) throw new Error(String(createJson?.error || 'Falha ao publicar'))
            setInfo('Publicado no IronTracks!')
            try { window.dispatchEvent(new Event('irontracks:stories:refresh')) } catch { }
            try { window.setTimeout(() => onClose?.(), 1000) } catch { }
        } catch (err: unknown) {
            logError('error', err)
            setError(String(getErrorMessage(err) || '').trim() || 'Falha ao publicar story.')
        } finally { setBusy(false); setBusyAction(null); setBusySubAction(null); setUploadProgress(0) }
    }, [mediaKind, selectedFile, metrics, layout, livePositions, backgroundImage, onClose]) // eslint-disable-line

    return {
        // refs
        inputRef, videoRef,
        // state
        selectedFile, mediaKind, backgroundUrl, backgroundImage,
        busy, busyAction, busySubAction, uploadProgress, isExporting,
        error, info, showSafeGuide, setShowSafeGuide,
        layout, livePositions, setLivePositions,
        draggingKey, saveImageUrl, setSaveImageUrl,
        showTrimmer, setShowTrimmer, videoDuration, trimRange, setTrimRange, previewTime, setPreviewTime,
        metrics,
        // handlers
        loadMedia, onSelectLayout,
        onPiecePointerDown, onPiecePointerMove, onPiecePointerUp,
        shareImage, postToIronTracks,
    }
}
