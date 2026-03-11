'use client'
import { useState, useCallback } from 'react'
import {
    generatePostWorkoutInsights,
    applyProgressionToNextTemplate,
} from '@/actions/workout-actions'
import { buildReportHTML } from '@/utils/report/buildHtml'
import { fetchLogoDataUrl } from '@/utils/report/fetchLogoDataUrl'
import { getErrorMessage } from '@/utils/errorMessage'
import {
    remapPrevLogsByCanonical,
    remapPrevBaseMsByCanonical,
    applyCanonicalNamesToSession,
    type AiState,
} from '@/hooks/useReportData'

type AnyObj = Record<string, unknown>

interface UseWorkoutReportHandlersParams {
    session: AnyObj | null
    user: AnyObj | null
    aiState: AiState
    setAiState: React.Dispatch<React.SetStateAction<AiState>>
    applyState: { status: string; error: string; templateId: string | null }
    setApplyState: React.Dispatch<React.SetStateAction<{ status: string; error: string; templateId: string | null }>>
    effectivePreviousSession: AnyObj | null
    prevLogsMap: Record<string, unknown>
    prevBaseMsMap: Record<string, number>
    calories: number
    setIsGenerating: (v: boolean) => void
    pdfUrl: string | null
    setPdfUrl: (url: string | null) => void
    onUpgrade?: () => void
}

export function useWorkoutReportHandlers({
    session,
    user,
    aiState,
    setAiState,
    applyState,
    setApplyState,
    effectivePreviousSession,
    prevLogsMap,
    prevBaseMsMap,
    calories,
    setIsGenerating,
    pdfUrl,
    setPdfUrl,
    onUpgrade,
}: UseWorkoutReportHandlersParams) {
    const [showExportMenu, setShowExportMenu] = useState(false)

    const handleApplyProgression = useCallback(async () => {
        if (!session) return
        const ai = aiState?.result && typeof aiState.result === 'object' ? (aiState.result as AnyObj) : null
        if (!ai) return
        const items = Array.isArray(ai.progression) ? ai.progression : []
        if (!items.length) return
        if (applyState.status === 'loading') return
        setApplyState({ status: 'loading', error: '', templateId: null })
        try {
            const res = await applyProgressionToNextTemplate({ session, historyId: session.id ?? null, progression: items })
            if (!res || res.ok === false) throw new Error((typeof res?.error === 'string' ? res.error : null) || 'Falha ao aplicar progressão')
            setApplyState({
                status: 'success',
                error: '',
                templateId: res.templateId && typeof res.templateId === 'string' ? res.templateId : null,
            })
        } catch (e: unknown) {
            const msg = getErrorMessage(e) ? String(getErrorMessage(e)) : String(e)
            setApplyState({ status: 'error', error: msg || 'Falha ao aplicar progressão', templateId: null })
        }
    }, [session, aiState, applyState.status, setApplyState])

    const handleDownloadPDF = useCallback(async () => {
        try {
            setIsGenerating(true)
            try { if (pdfUrl) URL.revokeObjectURL(pdfUrl) } catch { }
            const prev = effectivePreviousSession
            let canonicalMap: Record<string, unknown> = {}
            try {
                const currentNames = (Array.isArray(session?.exercises) ? (session!.exercises as unknown[]) : [])
                    .map((e: unknown) => { const o = e && typeof e === 'object' ? (e as AnyObj) : ({} as AnyObj); return o?.name })
                    .filter(Boolean)
                const prevNames = (Array.isArray((prev as AnyObj | null)?.exercises) ? ((prev as AnyObj).exercises as unknown[]) : [])
                    .map((e: unknown) => { const o = e && typeof e === 'object' ? (e as AnyObj) : ({} as AnyObj); return o?.name })
                    .filter(Boolean)
                const allNames = Array.from(new Set([...currentNames, ...prevNames].map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 120)
                if (allNames.length) {
                    const resp = await fetch('/api/exercises/canonicalize', {
                        method: 'POST', credentials: 'include',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ names: allNames, mode: 'prefetch' }),
                    })
                    const json = await resp.json().catch((): unknown => null)
                    if (resp.ok && json?.ok && json?.map && typeof json.map === 'object') canonicalMap = json.map as Record<string, unknown>
                }
            } catch { }

            const sessionForReport = applyCanonicalNamesToSession(session, canonicalMap)
            const prevForReport = applyCanonicalNamesToSession(prev, canonicalMap)
            const prevLogsForReport = remapPrevLogsByCanonical(prevLogsMap, canonicalMap)
            const prevBaseForReport = remapPrevBaseMsByCanonical(prevBaseMsMap, canonicalMap)
            let aiToUse: unknown = aiState?.result || (session?.ai && typeof session.ai === 'object' ? session.ai : null) || null

            if (!aiToUse) {
                try {
                    const res = await generatePostWorkoutInsights({ workoutId: typeof session?.id === 'string' ? session.id : null, session: session! })
                    if (res?.ok && res?.ai) {
                        aiToUse = res.ai
                        setAiState({ loading: false, error: null, result: res.ai && typeof res.ai === 'object' ? (res.ai as Record<string, unknown>) : null, cached: !!res.saved })
                    }
                } catch { }
            }

            const logoDataUrl = await fetchLogoDataUrl().catch(() => null)
            const html = buildReportHTML(sessionForReport, prevForReport, String(user?.displayName || user?.email || ''), calories, {
                prevLogsByExercise: prevLogsForReport,
                prevBaseMsByExercise: prevBaseForReport,
                ai: aiToUse || null,
                logoDataUrl: logoDataUrl || undefined,
            })
            const title = String(session?.workoutTitle || 'Treino').trim() || 'Treino'
            const fileName = `${title.replace(/\s+/g, '_')}_irontracks.html`
            const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
            if (canShare) {
                try {
                    const blob = new Blob([html], { type: 'text/html' })
                    const file = new File([blob], fileName, { type: 'text/html' })
                    const canShareFiles = typeof (navigator as { canShare?: (data: { files: File[] }) => boolean }).canShare === 'function'
                        && (navigator as { canShare: (data: { files: File[] }) => boolean }).canShare({ files: [file] })
                    if (canShareFiles) { await navigator.share({ files: [file], title: `${title} • IronTracks` }) }
                    else { const url = URL.createObjectURL(blob); await navigator.share({ title: `${title} • IronTracks`, url }); URL.revokeObjectURL(url) }
                    setShowExportMenu(false)
                    return
                } catch (shareErr) {
                    const msg = shareErr instanceof Error ? shareErr.message : ''
                    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) return
                }
            }
            const blobFallback = new Blob([html], { type: 'text/html' })
            const blobFallbackUrl = URL.createObjectURL(blobFallback)
            const printWindow = window.open(blobFallbackUrl, '_blank')
            if (printWindow) {
                setTimeout(() => { try { printWindow.focus(); printWindow.print() } catch { }; setTimeout(() => URL.revokeObjectURL(blobFallbackUrl), 60_000) }, 500)
            } else {
                URL.revokeObjectURL(blobFallbackUrl)
                const blob = new Blob([html], { type: 'text/html' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = fileName
                document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
            }
        } catch (e: unknown) {
            alert('Não foi possível abrir impressão: ' + getErrorMessage(e) + '\nPermita pop-ups para este site.')
        } finally {
            setIsGenerating(false)
            setTimeout(() => setIsGenerating(false), 500)
        }
    }, [session, user, aiState, effectivePreviousSession, prevLogsMap, prevBaseMsMap, calories, setIsGenerating, pdfUrl, setAiState])

    const handleGenerateAi = useCallback(async () => {
        if (!session) return
        if (aiState?.loading) return
        setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: true, error: null, cached: false }))
        try {
            const res = await generatePostWorkoutInsights({ workoutId: typeof session?.id === 'string' ? session.id : null, session: session! })
            if (!res?.ok) {
                if (res.upgradeRequired) { if (onUpgrade) onUpgrade(); else alert('Upgrade necessário para usar esta função.') }
                setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String(res?.error || 'Falha ao gerar insights'), cached: false }))
                return
            }
            setAiState({ loading: false, error: null, result: res.ai && typeof res.ai === 'object' ? (res.ai as Record<string, unknown>) : null, cached: !!res.saved })
        } catch (e) {
            setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String((e as AnyObj | null)?.message || e || 'Falha ao gerar insights'), cached: false }))
        }
    }, [session, aiState, setAiState, onUpgrade])

    const handlePartnerPlan = useCallback(async (partner: AnyObj) => {
        if (!session) return
        try {
            const userId = String(partner?.uid || partner?.id || '').trim()
            const planHtml = await import('@/utils/report/templates').then(m => m.workoutPlanHtml(session, { displayName: String(partner?.name || 'Parceiro') }))
            const blob = new Blob([planHtml], { type: 'text/html' })
            const file = new File([blob], `plano_${userId}_irontracks.html`, { type: 'text/html' })
            const canShareFiles = typeof (navigator as { canShare?: (d: { files: File[] }) => boolean }).canShare === 'function'
                && (navigator as { canShare: (d: { files: File[] }) => boolean }).canShare({ files: [file] })
            if (canShareFiles) await navigator.share({ files: [file], title: `Plano de ${String(partner?.name || 'Parceiro')} • IronTracks` })
            else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = file.name
                document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
            }
        } catch { }
    }, [session])

    const handleDownloadJson = useCallback(() => {
        if (!session) return
        try {
            const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const title = String(session?.workoutTitle || 'Treino').trim() || 'Treino'
            const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g, '_')}_irontracks.json`
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        } catch { }
    }, [session])

    const handleShare = useCallback(async () => {
        if (!session) return
        try {
            const title = String(session?.workoutTitle || 'Treino').trim() || 'Treino'
            await navigator.share({ title: `${title} • IronTracks`, url: window.location.href })
        } catch { }
    }, [session])

    const handlePrintIframe = useCallback(() => {
        if (typeof window !== 'undefined' && pdfUrl) {
            const frame = document.querySelector<HTMLIFrameElement>('iframe')
            if (frame?.contentWindow) frame.contentWindow.print()
        }
    }, [pdfUrl])

    const getAiRatingData = useCallback(() => {
        const ai = aiState?.result && typeof aiState.result === 'object' ? (aiState.result as AnyObj) : null
        const raw = ai?.rating ?? ai?.stars ?? ai?.score ?? null
        const n = Number(raw)
        if (!Number.isFinite(n)) return null
        const rating = Math.max(0, Math.min(5, Math.round(n)))
        const reason = String(ai?.rating_reason || ai?.ratingReason || ai?.reason || '').trim()
        return { rating, reason }
    }, [aiState])

    // renderAiRating kept as alias so callers using the old name still work
    const renderAiRating = getAiRatingData

    return {
        showExportMenu, setShowExportMenu,
        handleApplyProgression,
        handleDownloadPDF,
        handleGenerateAi,
        handlePartnerPlan,
        handleDownloadJson,
        handleShare,
        handlePrintIframe,
        renderAiRating,
    }
}
