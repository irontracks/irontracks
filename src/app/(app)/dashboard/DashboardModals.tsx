'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { X, Check, Upload, ArrowLeft, Clock } from 'lucide-react'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import { BackButton } from '@/components/ui/BackButton'
import type { AdminUser } from '@/types/admin'
import type { ActiveWorkoutSession } from '@/types/app'
import { getLatestWhatsNew } from '@/content/whatsNew'
import { getErrorMessage } from '@/utils/errorMessage'

const NotificationCenter = dynamic(() => import('@/components/NotificationCenter'), { ssr: false })
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false })
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false })
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false })
const OfflineSyncModal = dynamic(() => import('@/components/OfflineSyncModal'), { ssr: false })
const WelcomeFloatingWindow = dynamic(() => import('@/components/WelcomeFloatingWindow'), { ssr: false })

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
    setQuickViewWorkout: (v: unknown) => void
    handleStartSession: (w: unknown) => void

    // Notification Center
    showNotifCenter: boolean
    setShowNotifCenter: (v: boolean) => void

    // Rest Timer
    activeSession: ActiveWorkoutSession | null
    handleCloseTimer: () => void
    handleStartFromRestTimer: () => void

    // Session Floating Bar
    view: string
    setView: (v: string) => void
    sessionTicker: number
    parseStartedAtMs: (raw: unknown) => number
    calculateExerciseDuration: (ex: Record<string, unknown>) => number
    toMinutesRounded: (s: number) => number

    // Admin Panel
    showAdminPanel: boolean
    closeAdminPanel: () => void

    // WhatsNew
    whatsNewOpen: boolean
    setWhatsNewOpen: (v: boolean) => void
    pendingUpdate: Record<string, unknown> | null
    setPendingUpdate: (v: unknown) => void
    closeWhatsNew: () => void

    // PreCheckin
    preCheckinOpen: boolean
    setPreCheckinOpen: (v: boolean) => void
    preCheckinWorkout: Record<string, unknown> | null
    preCheckinDraft: Record<string, unknown> | null
    setPreCheckinDraft: (v: unknown) => void
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

    // Dialog
    alert: (msg: string, title?: string) => Promise<void>
}

export default function DashboardModals(props: DashboardModalsProps) {
    const {
        user, showCompleteProfile, setShowCompleteProfile, profileDraftName, setProfileDraftName,
        savingProfile, handleSaveProfile, showImportModal, setShowImportModal, importCode, setImportCode,
        handleImportWorkout, showJsonImportModal, setShowJsonImportModal, handleJsonUpload,
        shareCode, setShareCode, quickViewWorkout, setQuickViewWorkout, handleStartSession,
        showNotifCenter, setShowNotifCenter, activeSession, handleCloseTimer, handleStartFromRestTimer,
        view, setView, sessionTicker, parseStartedAtMs, calculateExerciseDuration, toMinutesRounded,
        showAdminPanel, closeAdminPanel, whatsNewOpen, setWhatsNewOpen, pendingUpdate,
        setPendingUpdate, closeWhatsNew, preCheckinOpen, setPreCheckinOpen, preCheckinWorkout,
        preCheckinDraft, setPreCheckinDraft, preCheckinResolveRef, settingsOpen, setSettingsOpen,
        userSettingsApi, offlineSyncOpen, setOfflineSyncOpen,
        openStudent, setOpenStudent, showExportModal, setShowExportModal, exportWorkout,
        handleExportPdf, handleExportJson, vipAccess, openVipView, alert,
    } = props

    const settings = userSettingsApi && typeof userSettingsApi === 'object'
        ? (userSettingsApi as Record<string, unknown>).settings ?? null
        : null
    const saving = userSettingsApi && typeof userSettingsApi === 'object'
        ? Boolean((userSettingsApi as Record<string, unknown>).saving)
        : false
    const saveFn = userSettingsApi && typeof userSettingsApi === 'object'
        ? (userSettingsApi as Record<string, unknown>).save as ((next: unknown) => Promise<{ ok: boolean; error?: string }>) | undefined
        : undefined

    return (
        <>
            {/* Complete Profile */}
            {showCompleteProfile && (
                <div className="fixed inset-0 z-[85] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="font-black text-white">Completar Perfil</h3>
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

            {/* Quick View */}
            {quickViewWorkout && (
                <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQuickViewWorkout(null)}>
                    <div className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                            <h3 className="font-bold text-white">{String((quickViewWorkout as Record<string, unknown>)?.title || '')}</h3>
                            <button type="button" onClick={() => setQuickViewWorkout(null)} className="flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors py-2 px-3 rounded-xl hover:bg-neutral-800 active:opacity-70" aria-label="Voltar">
                                <ArrowLeft size={20} /><span className="font-semibold text-sm">Voltar</span>
                            </button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
                            {(Array.isArray((quickViewWorkout as Record<string, unknown>)?.exercises) ? ((quickViewWorkout as Record<string, unknown>).exercises as unknown[]) : []).map((ex: unknown, idx: number) => {
                                const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                                return (
                                    <div key={idx} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-white text-sm">{String(e?.name || '—')}</h4>
                                            <span className="text-xs text-neutral-400">{(parseInt(String(e?.sets ?? '')) || 0)} x {String(e?.reps || '-')}</span>
                                        </div>
                                        <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                                            <Clock size={14} className="text-yellow-500" /><span>Descanso: {e?.restTime ? `${parseInt(String(e.restTime))}s` : '-'}</span>
                                        </div>
                                        {!!e?.notes && <p className="text-sm text-neutral-300 mt-2">{String(e.notes || '')}</p>}
                                    </div>
                                )
                            })}
                            {(!Array.isArray((quickViewWorkout as Record<string, unknown>)?.exercises) || ((quickViewWorkout as Record<string, unknown>).exercises as unknown[]).length === 0) && (
                                <p className="text-neutral-400 text-sm">Este treino não tem exercícios.</p>
                            )}
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex gap-2">
                            <button onClick={() => { const w = quickViewWorkout; setQuickViewWorkout(null); handleStartSession(w); }} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl">Iniciar Treino</button>
                            <button onClick={() => setQuickViewWorkout(null)} className="flex-1 p-3 bg-neutral-800 text-white font-bold rounded-xl">Fechar</button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Notification Center */}
            {showNotifCenter && (
                <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setShowNotifCenter(false)}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                            <h3 className="font-bold text-white">Notificações</h3>
                            <button type="button" onClick={() => setShowNotifCenter(false)} className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 relative">
                            <SectionErrorBoundary section="Notificações" onReset={() => setShowNotifCenter(false)}>
                                <NotificationCenter user={user as unknown as AdminUser} onStartSession={handleStartSession} embedded initialOpen />
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
                    onFinish={handleCloseTimer}
                    onStart={handleStartFromRestTimer}
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
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-in</div>
                                <div className="text-white font-black text-lg truncate">Pré-treino</div>
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
                            </div>
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

            {/* Offline Sync */}
            <OfflineSyncModal
                open={offlineSyncOpen}
                onClose={() => setOfflineSyncOpen(false)}
                userId={user?.id as string | undefined}
            />

            {/* Welcome */}
            <WelcomeFloatingWindow user={user as unknown as AdminUser} onClose={() => { }} />
        </>
    )
}
