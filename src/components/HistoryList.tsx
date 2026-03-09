"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HistorySummaryCard } from '@/components/history/HistorySummaryCard';
import { HistoryEmptyState, HistoryEmptyPeriod } from '@/components/history/HistoryEmptyStates';
import {
    CalendarDays, ChevronLeft, ChevronRight, Clock,
    Dumbbell, Edit3, History, Plus, Trash2, TrendingUp,
    CheckCircle2, Circle, Lock,
} from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import WorkoutReport from '@/components/WorkoutReport';
import { useDialog } from '@/contexts/DialogContext';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { SkeletonList } from '@/components/ui/Skeleton';
import { HistoryListManualModal } from '@/components/HistoryListManualModal';
import { HistoryListPeriodReportModal } from '@/components/HistoryListPeriodReportModal';
import { HistoryListEditModal } from '@/components/HistoryListEditModal';
import { HistoryListProps } from '@/components/historyListTypes';

import { useHistoryData, toDateMs } from '@/components/history/hooks/useHistoryData';
import { useHistoryActions } from '@/components/history/hooks/useHistoryActions';
import { useHistoryPeriodReport } from '@/components/history/hooks/useHistoryPeriodReport';

const HistoryList: React.FC<HistoryListProps> = ({
    user, settings, onViewReport, onBack, targetId, targetEmail,
    readOnly, title, embedded = false, vipLimits, onUpgrade,
}) => {
    const { confirm, alert } = useDialog();
    const isReadOnly = !!readOnly;

    // ── Data hook ────────────────────────────────────────────────────────────
    const data = useHistoryData({ user, settings, targetId, targetEmail, vipLimits });
    const {
        history, loading, supabase,
        range, setRange, rangeLabel, historyItems, filteredHistory, visibleHistory, blockedCount, summary,
        showManual, setShowManual, manualDate, setManualDate, manualDuration, setManualDuration,
        manualNotes, setManualNotes, manualTab, setManualTab,
        availableWorkouts, selectedTemplate, setSelectedTemplate,
        newWorkout, manualExercises, normalizeEditorWorkout, editorWorkout,
        updateManualExercise, saveManualExisting, saveManualNew,
    } = data;

    // ── Actions hook ─────────────────────────────────────────────────────────
    const actions = useHistoryActions({ user, supabase, setHistory: data.setHistory, alert, confirm });
    const {
        isSelectionMode, selectedIds,
        toggleSelectionMode, toggleItemSelection, handleBulkDelete,
        handleDeleteClick,
        showEdit, setShowEdit, editTitle, setEditTitle, editDate, setEditDate,
        editDuration, setEditDuration, editNotes, setEditNotes, editExercises,
        openEdit, updateEditExercise, saveEdit,
        selectedSession, setSelectedSession, openSession,
        getSessionMeta,
    } = actions;

    // ── Period report hook ───────────────────────────────────────────────────
    const report = useHistoryPeriodReport({ historyItems, user, alert });
    const {
        periodReport, periodAi, periodPdf, shareError, buildShareText,
        openPeriodReport, closePeriodReport, downloadPeriodPdf, handleShareReport,
    } = report;

    // ── Virtualized list ─────────────────────────────────────────────────────
    const parentRef = useRef<HTMLDivElement | null>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    useLayoutEffect(() => {
        const el = parentRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setScrollMargin(rect.top + window.scrollY);
    }, []);

    const rowVirtualizer = useWindowVirtualizer({
        count: visibleHistory.length,
        estimateSize: () => 156,
        overscan: 5,
        scrollMargin,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();

    // ── Helpers ─────────────────────────────────────────────────────────────
    // Clear selection when range changes while in selection mode
    useEffect(() => {
        if (!isSelectionMode) return;
        toggleSelectionMode(); // exits selection mode + clears
    }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

    const formatHistoryTitle = (t: unknown) => typeof t === 'string' && t ? t : 'Treino';

    const formatCompletedAt = (dateValue: unknown) => {
        try {
            if (!dateValue) return 'Data desconhecida';
            const d = new Date(String(dateValue));
            if (isNaN(d.getTime())) return 'Data desconhecida';
            return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} • ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch { return 'Data desconhecida'; }
    };

    const getWeekStart = (dateVal: unknown): string | null => {
        try {
            const t = toDateMs(dateVal);
            if (!t || !Number.isFinite(t)) return null;
            const d = new Date(t);
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            return monday.toISOString().slice(0, 10);
        } catch { return null; }
    };

    return (
        <>
            <div className={embedded ? 'w-full text-white' : 'min-h-screen bg-neutral-900 text-white p-4 pb-safe-extra'}>
                {/* Header */}
                {!embedded && (
                    <div className="mb-5 flex items-center gap-2 sm:gap-3">
                        <button type="button" onClick={onBack} className="cursor-pointer relative z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 transition-all duration-300 active:scale-95"><ChevronLeft className="pointer-events-none" /></button>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black flex items-center gap-2 truncate"><History className="text-yellow-500" /> {title || 'Histórico'}</h2>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{rangeLabel}</div>
                        </div>
                        <div className="flex items-center gap-2 justify-end shrink-0">
                            {!isReadOnly && historyItems.length > 0 && (
                                <button type="button" onClick={toggleSelectionMode} className={`h-9 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all duration-300 active:scale-95 ${isSelectionMode ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-800 border border-neutral-700 text-yellow-400 hover:bg-neutral-700'}`}>
                                    {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                                </button>
                            )}
                            {!isReadOnly && !isSelectionMode && (
                                <button type="button" onClick={() => setShowManual(true)} className="cursor-pointer relative z-10 w-9 h-9 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black flex items-center justify-center shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95">
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {embedded && (
                    <div className="flex items-center justify-end gap-2 mb-4">
                        {!isReadOnly && historyItems.length > 0 && (
                            <button type="button" onClick={toggleSelectionMode} className={`min-h-[44px] px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 ${isSelectionMode ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-900 border border-neutral-800 text-yellow-400 hover:bg-neutral-800'}`}>
                                {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                            </button>
                        )}
                        {!isReadOnly && !isSelectionMode && (
                            <button type="button" onClick={() => setShowManual(true)} className="cursor-pointer relative z-10 min-h-[44px] px-4 py-2 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black flex items-center gap-2 shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95">
                                <Plus size={16} />
                                <span className="hidden sm:inline">Adicionar treino</span>
                                <span className="sm:hidden">Adicionar</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Summary + Empties */}
                <div className="space-y-4">
                    <HistorySummaryCard
                        summary={summary} rangeLabel={rangeLabel} range={range}
                        hasItems={historyItems.length > 0} loading={loading}
                        onRangeChange={setRange} onOpenReport={openPeriodReport}
                    />
                    {!loading && historyItems.length === 0 && <HistoryEmptyState isReadOnly={isReadOnly} onAdd={() => setShowManual(true)} />}
                    {!loading && historyItems.length > 0 && filteredHistory.length === 0 && (
                        <HistoryEmptyPeriod onSeeAll={() => setRange('all')} on90Days={() => setRange('90')} />
                    )}
                </div>

                {/* Virtualized List */}
                {!loading && (visibleHistory.length > 0 || blockedCount > 0) && (
                    <div ref={parentRef} className="pb-24">
                        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                            {virtualItems.map((row) => {
                                const session = visibleHistory[row.index];
                                const minutes = Math.floor((Number(session?.totalTime) || 0) / 60);
                                const isSelected = selectedIds.has(session.id);
                                const meta = getSessionMeta(session);
                                const currentWeek = getWeekStart(session?.date ?? session?.dateMs);
                                const prevSession = row.index > 0 ? visibleHistory[row.index - 1] : null;
                                const prevWeek = prevSession ? getWeekStart(prevSession?.date ?? prevSession?.dateMs) : '__NONE__';
                                const showWeekHeader = currentWeek && currentWeek !== prevWeek;
                                const weekHeaderLabel = showWeekHeader
                                    ? `Semana de ${new Date(currentWeek + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                                    : '';

                                return (
                                    <div
                                        key={row.key} data-index={row.index} ref={rowVirtualizer.measureElement}
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start - rowVirtualizer.options.scrollMargin}px)`, paddingBottom: '12px' }}
                                    >
                                        {showWeekHeader && (
                                            <div className="flex items-center gap-2 mb-3 pt-1">
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-yellow-500/70 bg-yellow-500/5 border border-yellow-500/15 px-3 py-1 rounded-full">
                                                    <CalendarDays size={10} /> {weekHeaderLabel}
                                                </span>
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                            </div>
                                        )}

                                        <div
                                            onClick={() => isSelectionMode ? toggleItemSelection(session.id) : openSession(session, onViewReport)}
                                            className={`relative rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden ${isSelectionMode ? (isSelected ? 'shadow-lg shadow-yellow-500/10' : '') : 'hover:shadow-lg hover:shadow-black/30 group'}`}
                                        >
                                            <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-colors duration-300 ${isSelected ? 'bg-yellow-500' : 'bg-yellow-500/30 group-hover:bg-yellow-500/60'}`} />
                                            <div className={`rounded-2xl p-4 pl-5 ${isSelectionMode ? (isSelected ? 'border-yellow-500/50' : '') : 'group-hover:border-yellow-500/25'}`} style={{ background: 'rgba(255,255,255,0.02)', border: isSelectionMode ? (isSelected ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(255,255,255,0.05)') : '1px solid rgba(255,255,255,0.05)' }}>
                                                <div className="flex items-start gap-3">
                                                    {isSelectionMode && (
                                                        <div className="mt-0.5">
                                                            {isSelected ? <CheckCircle2 className="text-yellow-500 fill-yellow-500/20" /> : <Circle className="text-neutral-600" />}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <h3 className="font-black tracking-tight text-white truncate">{formatHistoryTitle(session?.workoutTitle)}</h3>
                                                                <div className="mt-1.5 flex items-center gap-2.5 text-xs text-neutral-400 flex-wrap">
                                                                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-yellow-500/60" />{formatCompletedAt(session?.date)}</span>
                                                                    <span className="inline-flex items-center gap-1"><Clock size={12} className="text-yellow-500/60" />{minutes} min</span>
                                                                </div>
                                                                {(meta.exCount > 0 || meta.vol > 0) && (
                                                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                                        {meta.exCount > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-400 bg-neutral-800/80 border border-neutral-700/50 px-2 py-0.5 rounded-full">
                                                                                <Dumbbell size={10} className="text-yellow-500/60" />
                                                                                {meta.exCount} exercício{meta.exCount !== 1 ? 's' : ''}
                                                                            </span>
                                                                        )}
                                                                        {meta.vol > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-500/80 bg-yellow-500/5 border border-yellow-500/15 px-2 py-0.5 rounded-full">
                                                                                <TrendingUp size={10} />
                                                                                {meta.vol >= 1000 ? `${(meta.vol / 1000).toFixed(1)}t` : `${Math.round(meta.vol)}kg`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {!isReadOnly && !isSelectionMode && (
                                                                    <>
                                                                        <button type="button" onClick={(e) => handleDeleteClick(e, session)} className="cursor-pointer relative z-20 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-500 border border-neutral-800 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 active:scale-95" aria-label="Excluir">
                                                                            <Trash2 size={16} className="pointer-events-none" />
                                                                        </button>
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(session); }} className="cursor-pointer relative z-20 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-500 border border-neutral-800 hover:bg-yellow-500/10 hover:text-yellow-400 hover:border-yellow-500/20 active:scale-95" aria-label="Editar">
                                                                            <Edit3 size={16} className="pointer-events-none" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {!isSelectionMode && <ChevronRight size={16} className="text-neutral-600 group-hover:text-yellow-500/60 transition-colors ml-0.5" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* VIP Locked Sessions */}
                        {blockedCount > 0 && (
                            <div className="bg-neutral-950/50 border border-yellow-500/20 rounded-2xl p-6 text-center space-y-3 relative overflow-hidden group cursor-pointer" onClick={onUpgrade}>
                                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/5 to-transparent pointer-events-none" />
                                <div className="relative z-10 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-300">
                                        <Lock className="text-yellow-500" size={20} />
                                    </div>
                                    <h3 className="text-lg font-black text-white">{blockedCount} treinos antigos bloqueados</h3>
                                    <p className="text-sm text-neutral-400 max-w-xs mx-auto">Seu plano atual permite visualizar apenas os últimos {vipLimits?.history_days} dias de histórico.</p>
                                    <button type="button" className="mt-2 px-5 py-2 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-wider hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/10">
                                        Desbloquear Histórico
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bulk delete bar */}
            {!isReadOnly && isSelectionMode && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-neutral-950 border-t border-neutral-800 pb-safe z-50 flex justify-between items-center">
                    <span className="text-neutral-500 text-sm font-bold">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button onClick={handleBulkDelete} disabled={selectedIds.size === 0} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 hover:bg-red-500/20 transition-colors">
                        <Trash2 size={18} /> Excluir
                    </button>
                </div>
            )}

            {/* Manual modal */}
            {!isReadOnly && showManual && (
                <HistoryListManualModal
                    manualTab={manualTab as 'existing' | 'new'} setManualTab={setManualTab as (v: 'existing' | 'new') => void}
                    manualDate={manualDate} setManualDate={setManualDate}
                    manualDuration={manualDuration} setManualDuration={setManualDuration}
                    manualNotes={manualNotes} setManualNotes={setManualNotes}
                    availableWorkouts={availableWorkouts}
                    selectedTemplate={selectedTemplate} setSelectedTemplate={setSelectedTemplate}
                    manualExercises={manualExercises} updateManualExercise={updateManualExercise}
                    editorWorkout={editorWorkout} setNewWorkout={(w) => data.setNewWorkout(normalizeEditorWorkout(w))}
                    normalizeEditorWorkout={normalizeEditorWorkout}
                    supabase={supabase} onClose={() => setShowManual(false)}
                    onSaveExisting={() => saveManualExisting(alert)}
                    onSaveNew={() => saveManualNew(alert)}
                />
            )}

            {/* Period report modal */}
            {periodReport && (
                <HistoryListPeriodReportModal
                    periodReport={periodReport} periodAi={periodAi} periodPdf={periodPdf}
                    shareError={shareError} buildShareText={buildShareText}
                    onClose={closePeriodReport} onDownloadPdf={downloadPeriodPdf} onShareReport={handleShareReport}
                />
            )}

            {/* Edit modal */}
            {showEdit && (
                <HistoryListEditModal
                    editTitle={editTitle} setEditTitle={setEditTitle}
                    editDate={editDate} setEditDate={setEditDate}
                    editDuration={editDuration} setEditDuration={setEditDuration}
                    editNotes={editNotes} setEditNotes={setEditNotes}
                    editExercises={editExercises} updateEditExercise={updateEditExercise}
                    onClose={() => setShowEdit(false)} onSave={saveEdit}
                />
            )}

            {/* Report overlay */}
            {selectedSession && (
                <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe" onClick={() => setSelectedSession(null)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <WorkoutReport
                            session={selectedSession} previousSession={null}
                            user={user} isVip={false} settings={settings}
                            onClose={() => setSelectedSession(null)} onUpgrade={onUpgrade}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default HistoryList;
