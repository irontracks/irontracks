'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { X, Check, Upload, ArrowLeft, Clock, Dumbbell, Zap, ChevronRight, PlayCircle } from 'lucide-react'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import { BackButton } from '@/components/ui/BackButton'
import type { AdminUser } from '@/types/admin'
import type { ActiveWorkoutSession } from '@/types/app'
import { getLatestWhatsNew } from '@/content/whatsNew'
import { getErrorMessage } from '@/utils/errorMessage'

const NotificationCenter = dynamic(() => import('@/components/NotificationCenter'), { ssr: false })
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false })
const ProgressPhotos = dynamic(() => import('@/components/ProgressPhotos'), { ssr: false })
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false })
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false })
const OfflineSyncModal = dynamic(() => import('@/components/OfflineSyncModal'), { ssr: false })
const WelcomeFloatingWindow = dynamic(() => import('@/components/WelcomeFloatingWindow'), { ssr: false })
const PartnerExerciseOverlay = dynamic(() => import('@/components/workout/PartnerExerciseOverlay'), { ssr: false })

import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'

// Helper
const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export interface DashboardModalsProps {
    // User
    user: Record<string, unknown> | null

    // Complete Profile
    showCompleteProfile: boolean
    setShowCompleteProfile: (v: boolean) => void
    profileDraftName: string
    setProfileDraftName: (v: string) => void
    savingProfile: boolean
    handleSaveProfile: () => void

    // Import Workout
    showImportModal: boolean
    setShowImportModal: (v: boolean) => void
    importCode: string
    setImportCode: (v: string) => void
    handleImportWorkout: () => void

    // JSON Import
    showJsonImportModal: boolean
    setShowJsonImportModal: (v: boolean) => void
    handleJsonUpload: (e: React.ChangeEvent<HTMLInputElement>) => void

    // Share Code
    shareCode: string | null
    setShareCode: (v: string | null) => void

    // Quick View
    quickViewWorkout: Record<string, unknown> | null
    setQuickViewWorkout: (v: Record<string, unknown> | null) => void
    handleStartSession: (w: unknown) => void

    // Notification Center
    showNotifCenter: boolean
    setShowNotifCenter: (v: boolean) => void

    // Rest Timer
    activeSession: ActiveWorkoutSession | null
    handleCloseTimer: () => void
    handleTimerFinish: (context?: unknown) => void
    handleStartFromRestTimer: () => void

    // Session Floating Bar
    view: string
    setView: (v: string) => void
    sessionTicker: number
    parseStartedAtMs: (raw: unknown) => number
    calculateExerciseDuration: (ex: Record<string, unknown>) => number
    toMinutesRounded: (s: number) => number | string

    // Admin Panel
    showAdminPanel: boolean
    closeAdminPanel: () => void

    // WhatsNew
    whatsNewOpen: boolean
    setWhatsNewOpen: (v: boolean) => void
    pendingUpdate: Record<string, unknown> | null
    setPendingUpdate: (v: Record<string, unknown> | null) => void
    closeWhatsNew: () => void

    // PreCheckin
    preCheckinOpen: boolean
    setPreCheckinOpen: (v: boolean) => void
    preCheckinWorkout: Record<string, unknown> | null
    preCheckinDraft: Record<string, unknown> | null
    setPreCheckinDraft: (v: Record<string, unknown> | null) => void
    preCheckinResolveRef: React.MutableRefObject<((v: unknown) => void) | null>

    // Settings
    settingsOpen: boolean
    setSettingsOpen: (v: boolean) => void
    userSettingsApi: Record<string, unknown> | null

    // Offline Sync
    offlineSyncOpen: boolean
    setOfflineSyncOpen: (v: boolean) => void

    // Open student
    openStudent: unknown
    setOpenStudent: (v: unknown) => void

    // Export
    showExportModal: boolean
    setShowExportModal: (v: boolean) => void
    exportWorkout: unknown
    handleExportPdf: () => void
    handleExportJson: () => void

    // VIP
    vipAccess: Record<string, unknown> | null
    openVipView: () => void

    // Progress Photos
    showProgressPhotos: boolean
    setShowProgressPhotos: (v: boolean) => void

    // Dialog
    alert: (msg: string, title?: string) => Promise<unknown>
}

export default function DashboardModals(props: DashboardModalsProps) {
    const {
        user, showCompleteProfile, setShowCompleteProfile, profileDraftName, setProfileDraftName,
        savingProfile, handleSaveProfile, showImportModal, setShowImportModal, importCode, setImportCode,
        handleImportWorkout, showJsonImportModal, setShowJsonImportModal, handleJsonUpload,
        shareCode, setShareCode, quickViewWorkout, setQuickViewWorkout, handleStartSession,
        showNotifCenter, setShowNotifCenter, activeSession, handleCloseTimer, handleTimerFinish, handleStartFromRestTimer,
        view, setView, sessionTicker, parseStartedAtMs, calculateExerciseDuration, toMinutesRounded,
        showAdminPanel, closeAdminPanel, whatsNewOpen, setWhatsNewOpen, pendingUpdate,
        setPendingUpdate, closeWhatsNew, preCheckinOpen, setPreCheckinOpen, preCheckinWorkout,
        preCheckinDraft, setPreCheckinDraft, preCheckinResolveRef, settingsOpen, setSettingsOpen,
        userSettingsApi, offlineSyncOpen, setOfflineSyncOpen,
        openStudent, setOpenStudent, showExportModal, setShowExportModal, exportWorkout,
        handleExportPdf, handleExportJson, vipAccess, openVipView, alert,
        showProgressPhotos, setShowProgressPhotos,
    } = props

    // Partner exercise share — use hook directly since we're inside TeamWorkoutProvider
    let teamWorkoutCtx: ReturnType<typeof useTeamWorkout> | null = null
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        teamWorkoutCtx = useTeamWorkout()
    } catch { /* not inside TeamWorkoutProvider */ }

    const settings = userSettingsApi && typeof userSettingsApi === 'object'
        ? (userSettingsApi as Record<string, unknown>).settings ?? null
        : null
    const saving = userSettingsApi && typeof userSettingsApi === 'object'
        ? Boolean((userSettingsApi as Record<string, unknown>).saving)
        : false
    const saveFn = userSettingsApi && typeof userSettingsApi === 'object'
        ? (userSettingsApi as Record<string, unknown>).save as ((next: unknown) => Promise<{ ok: boolean; error?: string }>) | undefined
        : undefined

    // Patch a subset of settings immediately (used by SettingsModal for HealthKit consent)
    const patchSettingsFn = async (patch: Record<string, unknown>) => {
        if (!saveFn || !settings) return
        await saveFn({ ...(settings as Record<string, unknown>), ...patch }).catch(() => { })
    }

    // Determine if the user already has body weight in profile (so we can hide weight from pre-checkin)
    const profileBodyWeightKg = (() => {
        try {
            const s = settings as Record<string, unknown> | null
            const val = Number(s?.bodyWeightKg)
            return isFinite(val) && val > 0 ? val : null
        } catch { return null }
    })()

    return (
        <>
            {/* Complete Profile */}
            {showCompleteProfile && (
                <div className="fixed inset-0 z-[85] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="font-bold text-white">Completar Perfil</h3>
                            <button type="button" onClick={() => setShowCompleteProfile(false)} className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Nome de Exibição</label>
                        <input value={profileDraftName} onChange={(e) => setProfileDraftName(e.target.value)} placeholder="Ex: João Silva" className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500" />
                        <div className="flex gap-2 mt-5">
                            <button type="button" onClick={() => setShowCompleteProfile(false)} disabled={savingProfile} className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-300 disabled:opacity-50">Cancelar</button>
                            <button type="button" onClick={handleSaveProfile} disabled={savingProfile} className="flex-1 p-3 bg-yellow-500 rounded-xl font-black text-black disabled:opacity-50">{savingProfile ? 'Salvando...' : 'Salvar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Workout */}
            {showImportModal && (
                <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                        <h3 className="font-bold text-white mb-4">Importar Treino (Código)</h3>
                        <input value={importCode} onChange={e => setImportCode(e.target.value)} placeholder="Cole o código do treino aqui" className="w-full bg-neutral-800 p-4 rounded-xl mb-4 text-white font-mono text-center uppercase" />
                        <div className="flex gap-2">
                            <button onClick={() => setShowImportModal(false)} className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-400">Cancelar</button>
                            <button onClick={handleImportWorkout} className="flex-1 p-3 bg-blue-600 rounded-xl font-bold text-white">Importar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* JSON Import */}
            {showJsonImportModal && (
                <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                        <Upload size={48} className="mx-auto text-blue-500 mb-4" />
                        <h3 className="font-bold text-white mb-2 text-xl">Restaurar Backup</h3>
                        <p className="text-neutral-400 text-sm mb-6">Selecione o arquivo .json que você salvou anteriormente.</p>
                        <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors">
                            Selecionar Arquivo
                            <input type="file" accept=".json" onChange={handleJsonUpload} className="hidden" />
                        </label>
                        <button onClick={() => setShowJsonImportModal(false)} className="mt-4 text-neutral-500 text-sm hover:text-white">Cancelar</button>
                    </div>
                </div>
            )}

            {/* Share Code */}
            {shareCode && (
                <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-black"><Check size={32} /></div>
                        <h3 className="font-bold text-white mb-2">Link Gerado!</h3>
                        <p className="text-neutral-400 text-sm mb-6">Envie este código para seu aluno ou amigo.</p>
                        <div className="bg-black p-4 rounded-xl font-mono text-yellow-500 text-xl mb-4 tracking-widest select-all">{shareCode}</div>
                        <button onClick={() => setShareCode(null)} className="w-full p-3 bg-neutral-800 rounded-xl font-bold text-white">Fechar</button>
                    </div>
                </div>
            )}

            {/* Quick View — Premium Redesign */}
            {quickViewWorkout && (() => {
                const qw = quickViewWorkout as Record<string, unknown>
                const exercises = Array.isArray(qw?.exercises) ? qw.exercises as Record<string, unknown>[] : []
                const title = String(qw?.title || qw?.name || 'Treino')
                const exCount = exercises.length
                return (
                    <div
                        className="fixed inset-0 z-[75] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
                        onClick={() => setQuickViewWorkout(null)}
                    >
                        {/* Modal card */}
                        <div
                            className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-[0_-20px_80px_rgba(0,0,0,0.7)] sm:shadow-[0_40px_120px_rgba(0,0,0,0.8)] border border-white/[0.07] animate-in slide-in-from-bottom-4 sm:fade-in sm:slide-in-from-bottom-0 duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Glassmorphism bg layers */}
                            <div className="absolute inset-0 bg-neutral-950/97 backdrop-blur-2xl" />
                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.06] via-transparent to-transparent pointer-events-none" />
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />

                            {/* Content */}
                            <div className="relative">
                                {/* Handle bar (mobile) */}
                                <div className="sm:hidden flex justify-center pt-3 pb-0">
                                    <div className="w-10 h-1 rounded-full bg-white/15" />
                                </div>

                                {/* Header */}
                                <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-500/25 to-amber-600/15 border border-yellow-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-yellow-500/10 mt-0.5">
                                            <Dumbbell size={18} className="text-yellow-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-500/70 leading-none mb-1">Treino</div>
                                            <h3 className="font-bold text-white text-lg leading-snug truncate">{title}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[11px] font-bold text-neutral-500">{exCount} exercício{exCount !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setQuickViewWorkout(null)}
                                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                                        aria-label="Voltar"
                                    >
                                        <ArrowLeft size={12} />
                                        Voltar
                                    </button>
                                </div>

                                {/* Gold divider */}
                                <div className="mx-5 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent mb-1" />

                                {/* Exercise list */}
                                <div className="px-3 py-2 max-h-[52vh] overflow-y-auto space-y-2">
                                    {exCount === 0 && (
                                        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-neutral-800/60 border border-neutral-700/40 flex items-center justify-center">
                                                <Dumbbell size={20} className="text-neutral-600" />
                                            </div>
                                            <p className="text-neutral-500 text-sm">Este treino não tem exercícios.</p>
                                        </div>
                                    )}
                                    {exercises.map((ex, idx) => {
                                        const sets = parseInt(String(ex?.sets ?? ex?.numSets ?? '')) || 0
                                        const reps = String(ex?.reps || '—')
                                        const rest = ex?.restTime ? `${parseInt(String(ex.restTime))}s` : ex?.rest_time ? `${parseInt(String(ex.rest_time))}s` : null
                                        const method = String(ex?.method || '')
                                        const notes = String(ex?.notes || '').trim()
                                        const isSpecialMethod = method && method.toLowerCase() !== 'normal' && method.toLowerCase() !== ''
                                        return (
                                            <div
                                                key={idx}
                                                className="group relative bg-white/[0.03] border border-white/[0.07] hover:border-yellow-500/20 hover:bg-white/[0.05] rounded-2xl p-4 transition-all duration-200"
                                            >
                                                {/* Exercise number accent */}
                                                <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />

                                                <div className="pl-3">
                                                    {/* Top row: name + sets/reps */}
                                                    <div className="flex items-start justify-between gap-3 mb-2">
                                                        <div className="flex items-start gap-2.5 min-w-0">
                                                            <span className="flex-shrink-0 w-5 h-5 rounded-md bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-[10px] font-black text-yellow-400 leading-none mt-0.5">
                                                                {idx + 1}
                                                            </span>
                                                            <h4 className="font-bold text-white text-[13.5px] leading-snug">{String(ex?.name || '—')}</h4>
                                                        </div>
                                                        {sets > 0 && (
                                                            <div className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                                                <span className="text-[12px] font-black text-yellow-400">{sets} × {reps}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Badges row */}
                                                    <div className="flex flex-wrap items-center gap-1.5 ml-7">
                                                        {rest && (
                                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800/80 border border-neutral-700/50">
                                                                <Clock size={10} className="text-yellow-500" />
                                                                <span className="text-[10.5px] font-bold text-neutral-400">Descanso: {rest}</span>
                                                            </div>
                                                        )}
                                                        {isSpecialMethod && (
                                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                                                                <Zap size={10} className="text-violet-400" />
                                                                <span className="text-[10.5px] font-bold text-violet-400">{method}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Notes */}
                                                    {notes && (
                                                        <div className="mt-2.5 ml-7 pl-3 border-l border-yellow-500/20">
                                                            <p className="text-[11.5px] text-neutral-400 leading-relaxed italic">{notes}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Bottom padding area */}
                                <div className="h-2" />

                                {/* Gold top-line divider before CTA */}
                                <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                                {/* CTA Footer */}
                                <div className="p-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setQuickViewWorkout(null)}
                                        className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
                                        aria-label="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { const w = quickViewWorkout; setQuickViewWorkout(null); handleStartSession(w); }}
                                        className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-2xl py-3.5 text-[14px] uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-yellow-500/25"
                                    >
                                        <PlayCircle size={18} className="fill-black/20" />
                                        Iniciar Treino
                                        <ChevronRight size={16} className="opacity-60" />
                                    </button>
                                </div>

                                {/* Safe area spacer */}
                                <div className="h-safe-bottom sm:hidden" />
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Export Modal */}
            {showExportModal && exportWorkout && (
                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                            <h3 className="font-bold text-white">Como deseja exportar?</h3>
                            <BackButton onClick={() => setShowExportModal(false)} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
                        </div>
                        <div className="p-4 space-y-3">
                            <button onClick={handleExportPdf} className="w-full px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl">Baixar PDF</button>
                            <button onClick={handleExportJson} className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl">Baixar JSON</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Open Student */}
            {openStudent && (
                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpenStudent(null)}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                            <h3 className="font-bold text-white">Treinos de {String((isRecord(openStudent) ? (openStudent as Record<string, unknown>).name : '') ?? '')}</h3>
                            <BackButton onClick={() => setOpenStudent(null)} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
                        </div>
                        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                            {(() => {
                                const s = isRecord(openStudent) ? (openStudent as Record<string, unknown>) : {}
                                const list = Array.isArray(s.workouts) ? s.workouts : []
                                if (list.length !== 0) return null
                                return <p className="text-neutral-500 text-sm">Nenhum treino encontrado.</p>
                            })()}
                            {(() => {
                                const s = isRecord(openStudent) ? (openStudent as Record<string, unknown>) : {}
                                const list = Array.isArray(s.workouts) ? s.workouts : []
                                return list.map((w: unknown, idx: number) => {
                                    const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                                    const id = String(wo?.id || '').trim() || `w-${idx}`
                                    const exCount = Array.isArray(wo?.exercises) ? (wo.exercises as unknown[]).length : 0
                                    return (
                                        <div key={id} className="p-3 rounded-xl border border-neutral-700 bg-neutral-800">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-bold text-sm">{String(wo?.title || '')}</span>
                                                <span className="text-xs text-neutral-400">{exCount} exercícios</span>
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Center — always mounted to avoid fetch race condition (ghost notifications).
                The wrapper is hidden via `display:none` so the component stays alive and pre-loaded. */}
            {user && (
                <div
                    style={{ display: showNotifCenter ? undefined : 'none' }}
                    className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                    onClick={() => setShowNotifCenter(false)}
                >
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                            <h3 className="font-bold text-white">Notificações</h3>
                            <button type="button" onClick={() => setShowNotifCenter(false)} className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 relative">
                            <SectionErrorBoundary section="Notificações" onReset={() => setShowNotifCenter(false)}>
                                <NotificationCenter user={user as AdminUser} onStartSession={handleStartSession} embedded initialOpen open={showNotifCenter} />
                            </SectionErrorBoundary>
                        </div>
                    </div>
                </div>
            )}

            {/* Rest Timer */}
            {activeSession?.timerTargetTime && (
                <RestTimerOverlay
                    targetTime={activeSession.timerTargetTime}
                    context={activeSession.timerContext as unknown as Parameters<typeof import('@/components/workout/RestTimerOverlay').default>[0]['context']}
                    settings={settings as Record<string, unknown> | null}
                    onClose={handleCloseTimer}
                    onFinish={(ctx) => { handleTimerFinish(ctx); handleCloseTimer(); }}
                    onStart={handleStartFromRestTimer}
                    autoStartEnabled={Boolean((settings as Record<string, unknown> | null)?.restTimerAutoStart)}
                    onToggleAutoStart={() => {
                        try {
                            const s = (settings as Record<string, unknown> | null) ?? {}
                            const next = { ...s, restTimerAutoStart: !s.restTimerAutoStart }
                            saveFn?.(next)
                        } catch { }
                    }}
                />
            )}

            {/* Partner Exercise Control Overlay */}
            {teamWorkoutCtx?.incomingExerciseShare && (
                <PartnerExerciseOverlay
                    share={teamWorkoutCtx.incomingExerciseShare}
                    onSendUpdate={teamWorkoutCtx.sendExerciseControlUpdate}
                    onEnd={teamWorkoutCtx.endExerciseShare}
                />
            )}

            {/* Session Floating Bar */}
            {activeSession && view !== 'active' && (
                <div className="fixed bottom-0 left-0 right-0 z-[1100]">
                    <div className="bg-neutral-900/95 backdrop-blur border-t border-neutral-800 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white truncate">{(activeSession as Record<string, unknown>).workout && typeof (activeSession as Record<string, unknown>).workout === 'object' ? String(((activeSession as Record<string, unknown>).workout as Record<string, unknown>)?.title || 'Treino em andamento') : 'Treino em andamento'}</h3>
                                <div className="flex items-center gap-3 text-xs text-neutral-300 mt-1">
                                    <span className="font-mono text-yellow-500">{(() => { const startMs = parseStartedAtMs((activeSession as Record<string, unknown>).startedAt); const endMs = sessionTicker || startMs; const s = startMs > 0 ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0; const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; })()}</span>
                                    <span className="text-neutral-500">tempo atual</span>
                                    <span className="opacity-30">•</span>
                                    <span className="font-mono text-neutral-200">{(() => { const workout = (activeSession as Record<string, unknown>).workout; const list = workout && typeof workout === 'object' && Array.isArray((workout as Record<string, unknown>).exercises) ? ((workout as Record<string, unknown>).exercises as unknown[]) : []; const total = list.reduce((acc: number, ex: unknown) => acc + calculateExerciseDuration((ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>))), 0); return `${toMinutesRounded(total)} min`; })()}</span>
                                    <span className="text-neutral-500">estimado total</span>
                                </div>
                                <div className="h-1 bg-neutral-700 rounded-full overflow-hidden mt-2">
                                    {(() => {
                                        const workout = (activeSession as Record<string, unknown>).workout as Record<string, unknown> | null
                                        const exCount = (workout?.exercises && Array.isArray(workout.exercises) ? workout.exercises : []).length
                                        let percent = 0
                                        if (exCount) {
                                            const done = new Set()
                                            const logs = (activeSession as Record<string, unknown>).logs as Record<string, unknown> | null
                                            if (logs) {
                                                Object.keys(logs).forEach(k => {
                                                    const i = parseInt(k.split('-')[0]) || 0
                                                    done.add(i)
                                                })
                                            }
                                            const current = Math.min(done.size, exCount)
                                            percent = Math.round((current / exCount) * 100)
                                        }
                                        return <div className="h-full bg-yellow-500" style={{ width: `${percent}%` }}></div>
                                    })()}
                                </div>
                            </div>
                            <button className="shrink-0 px-4 py-2 bg-yellow-500 text-black font-black rounded-xl hover:bg-yellow-400" onClick={() => setView('active')}>Voltar pro treino</button>
                        </div>
                    </div>
                </div>
            )}



            {/* WhatsNew */}
            {whatsNewOpen && (
                <WhatsNewModal
                    isOpen={whatsNewOpen}
                    entry={pendingUpdate ? null : getLatestWhatsNew()}
                    update={pendingUpdate ? {
                        id: String(pendingUpdate?.id || ''),
                        version: (pendingUpdate?.version as string) || null,
                        title: String(pendingUpdate?.title || ''),
                        description: String(pendingUpdate?.description || ''),
                        release_date: String(pendingUpdate?.release_date || pendingUpdate?.releaseDate || '') || null,
                    } : null}
                    onClose={closeWhatsNew}
                />
            )}

            {/* PreCheckin */}
            {preCheckinOpen && (
                <div
                    className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                    onClick={() => {
                        setPreCheckinOpen(false)
                        const r = preCheckinResolveRef.current
                        preCheckinResolveRef.current = null
                        if (typeof r === 'function') r(null)
                    }}
                >
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-bold uppercase tracking-widest text-yellow-500">Check-in</div>
                                <div className="text-white font-bold text-lg truncate">Pré-treino</div>
                                <div className="text-xs text-neutral-400 truncate">{String(preCheckinWorkout?.title || preCheckinWorkout?.name || 'Treino')}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreCheckinOpen(false)
                                    const r = preCheckinResolveRef.current
                                    preCheckinResolveRef.current = null
                                    if (typeof r === 'function') r(null)
                                }}
                                className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                                aria-label="Fechar"
                            ><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-6">
                            {/* Weight field — only show when profile doesn't have a weight set */}
                            {!profileBodyWeightKg ? (
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-500 mb-2">Peso (kg)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="Ex: 85.0"
                                        value={String((preCheckinDraft as Record<string, unknown>)?.weight ?? '')}
                                        onChange={(e) => setPreCheckinDraft({ ...(preCheckinDraft || {}), weight: e.target.value })}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500"
                                    />
                                    <p className="mt-1.5 text-[11px] text-yellow-500/70 leading-snug">
                                        ⚡ Preencher melhora a precisão do gasto calórico no relatório final.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                                    <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-green-400 text-sm">✓</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-green-300">Peso do perfil: {profileBodyWeightKg} kg</p>
                                        <p className="text-[11px] text-green-400/60">Gasto calórico calculado automaticamente</p>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold uppercase text-neutral-500 mb-2">Como se sente?</label>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'great', label: '💪 Ótimo', color: 'bg-green-500/20 border-green-500/40 text-green-300' },
                                        { value: 'normal', label: '😐 Normal', color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' },
                                        { value: 'tired', label: '😴 Cansado', color: 'bg-red-500/20 border-red-500/40 text-red-300' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setPreCheckinDraft({ ...(preCheckinDraft || {}), mood: opt.value })}
                                            className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-colors ${(preCheckinDraft as Record<string, unknown>)?.mood === opt.value ? opt.color : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}
                                        >{opt.label}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-neutral-500 mb-2">Notas (opcional)</label>
                                <textarea
                                    placeholder="Ex: Dor leve no ombro direito"
                                    value={String((preCheckinDraft as Record<string, unknown>)?.notes ?? '')}
                                    onChange={(e) => setPreCheckinDraft({ ...(preCheckinDraft || {}), notes: e.target.value })}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 resize-none h-20"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setPreCheckinOpen(false)
                                    const r = preCheckinResolveRef.current
                                    preCheckinResolveRef.current = null
                                    if (typeof r === 'function') r(null)
                                }}
                                className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-300"
                            >Pular</button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreCheckinOpen(false)
                                    const r = preCheckinResolveRef.current
                                    preCheckinResolveRef.current = null
                                    if (typeof r === 'function') r(preCheckinDraft)
                                }}
                                className="flex-1 p-3 bg-yellow-500 rounded-xl font-black text-black"
                            >Continuar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings */}
            {settingsOpen && (
                <SettingsModal
                    isOpen={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                    settings={settings as Record<string, unknown> | null}
                    userRole={String((user as Record<string, unknown>)?.role || '')}
                    saving={saving}
                    onOpenWhatsNew={async () => {
                        setSettingsOpen(false)
                        if (!pendingUpdate) {
                            try {
                                const res = await fetch(`/api/updates/unseen?limit=1`)
                                const data = await res.json().catch(() => ({}))
                                const updates = Array.isArray(data?.updates) ? data.updates : []
                                const first = updates[0] || null
                                if (first) {
                                    try {
                                        await fetch('/api/updates/mark-prompted', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ updateId: String(first.id) })
                                        })
                                    } catch { }
                                    setPendingUpdate(first)
                                }
                            } catch { }
                        }
                        setWhatsNewOpen(true)
                    }}
                    onOpenProgressPhotos={() => { setSettingsOpen(false); setShowProgressPhotos(true) }}
                    patchSettings={patchSettingsFn}
                    onSave={async (next: unknown) => {
                        try {
                            const safeNext = next && typeof next === 'object' ? next : (settings ?? {})
                            const res = await saveFn?.(safeNext)
                            if (!res?.ok) {
                                await alert('Falha ao salvar: ' + (res?.error || ''))
                                return false
                            }
                            return true
                        } catch (e: unknown) {
                            await alert('Falha ao salvar: ' + getErrorMessage(e))
                            return false
                        }
                    }}
                />
            )}

            {/* Progress Photos */}
            {showProgressPhotos && (
                <ProgressPhotos onClose={() => setShowProgressPhotos(false)} />
            )}

            {/* Offline Sync */}
            <OfflineSyncModal
                open={offlineSyncOpen}
                onClose={() => setOfflineSyncOpen(false)}
                userId={user?.id as string | undefined}
            />

            {/* Welcome */}
            <WelcomeFloatingWindow user={user as AdminUser} onClose={() => { }} />
        </>
    )
}
