'use client'
import React, { useEffect, useState, useCallback } from 'react';
import {
    AlertTriangle, RefreshCw, Settings, Send, Clock,
    CheckCheck, TrendingDown, Zap, AlertCircle, UserX, X, Inbox
} from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import type { UnknownRecord } from '@/types/app';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriorityItem {
    id: string;
    student_user_id: string;
    student_name: string;
    kind: string;
    title: string;
    reason: string;
    score: number;
    suggested_message: string;
    last_workout_at: string | null;
}

// ─── Kind config ──────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, {
    label: string;
    Icon: React.FC<{ size?: number }>;
    bg: string;
    text: string;
    border: string;
}> = {
    churn_risk: {
        label: 'Risco de Churn',
        Icon: UserX,
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
    },
    volume_drop: {
        label: 'Queda de Volume',
        Icon: TrendingDown,
        bg: 'bg-orange-500/10',
        text: 'text-orange-400',
        border: 'border-orange-500/20',
    },
    load_spike: {
        label: 'Aumento de Carga',
        Icon: Zap,
        bg: 'bg-yellow-500/10',
        text: 'text-yellow-400',
        border: 'border-yellow-500/20',
    },
    checkins_alert: {
        label: 'Alerta Check-in',
        Icon: AlertCircle,
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastWorkout(isoStr: string | null): string {
    if (!isoStr) return 'Sem treinos';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '—';
    const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    return `${diffDays} dias atrás`;
}

function toPriorityItems(raw: UnknownRecord[]): PriorityItem[] {
    return raw.map((r) => ({
        id: String(r.id ?? ''),
        student_user_id: String(r.student_user_id ?? ''),
        student_name: String(r.student_name ?? ''),
        kind: String(r.kind ?? ''),
        title: String(r.title ?? ''),
        reason: String(r.reason ?? ''),
        score: Number(r.score ?? 0),
        suggested_message: String(r.suggested_message ?? ''),
        last_workout_at: r.last_workout_at != null ? String(r.last_workout_at) : null,
    }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ItemCardProps {
    item: PriorityItem;
    isActioning: boolean;
    onDone: () => void;
    onSnooze: () => void;
    onCompose: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isActioning, onDone, onSnooze, onCompose }) => {
    const cfg = KIND_CONFIG[item.kind] ?? {
        label: item.kind,
        Icon: AlertTriangle,
        bg: 'bg-neutral-500/10',
        text: 'text-neutral-400',
        border: 'border-neutral-500/20',
    };
    const { Icon } = cfg;

    return (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            <Icon size={11} />
                            {cfg.label}
                        </span>
                    </div>
                    <span className="text-white font-bold text-sm truncate">{item.student_name || '—'}</span>
                </div>
                <span className="text-[11px] text-neutral-400 whitespace-nowrap shrink-0 pt-0.5">
                    {formatLastWorkout(item.last_workout_at)}
                </span>
            </div>

            {/* Reason */}
            <p className="text-neutral-300 text-xs leading-relaxed">{item.reason}</p>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onCompose}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                    <Send size={12} />
                    Enviar mensagem
                </button>
                <button
                    type="button"
                    onClick={onSnooze}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                    <Clock size={12} />
                    Soneca
                </button>
                <button
                    type="button"
                    onClick={onDone}
                    disabled={isActioning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                    <CheckCheck size={12} />
                    Feito
                </button>
                {isActioning && (
                    <span className="text-xs text-neutral-400 animate-pulse">Salvando…</span>
                )}
            </div>
        </div>
    );
};

// ─── Settings panel ───────────────────────────────────────────────────────────

interface SettingsPanelProps {
    settings: {
        churnDays: number;
        volumeDropPct: number;
        loadSpikePct: number;
        minPrev7Volume: number;
        minCurrent7VolumeSpike: number;
        snoozeDefaultMinutes: number;
    };
    loading: boolean;
    error: string;
    onChange: (field: string, value: number) => void;
    onSave: () => void;
    onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, loading, error, onChange, onSave, onClose }) => {
    const field = (label: string, key: string, min: number, max: number, hint: string) => (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-neutral-300 uppercase tracking-wide">{label}</span>
            <div className="flex items-center gap-3">
                <input
                    aria-label={label}
                    type="number"
                    min={min}
                    max={max}
                    value={settings[key as keyof typeof settings]}
                    onChange={(e) => onChange(key, Number(e.target.value))}
                    className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-yellow-500/60"
                />
                <span className="text-xs text-neutral-400">{hint}</span>
            </div>
        </label>
    );

    return (
        <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between mb-1">
                <h4 className="font-black text-white text-sm">Configurações do Inbox</h4>
                <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-300">
                    <X size={16} />
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('Dias sem treinar (Churn)', 'churnDays', 1, 60, 'dias')}
                {field('Queda de volume (%)', 'volumeDropPct', 5, 90, '% de queda')}
                {field('Aumento de carga (%)', 'loadSpikePct', 10, 300, '% de aumento')}
                {field('Volume mínimo prev. 7d', 'minPrev7Volume', 0, 1000000, 'kg vol')}
                {field('Volume mín. atual spike', 'minCurrent7VolumeSpike', 0, 1000000, 'kg vol')}
                {field('Soneca padrão (minutos)', 'snoozeDefaultMinutes', 5, 10080, 'min (1440=24h)')}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2 justify-end">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={loading}
                    className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black rounded-lg disabled:opacity-50 transition-colors"
                >
                    {loading ? 'Salvando…' : 'Salvar'}
                </button>
            </div>
        </div>
    );
};

// ─── Compose modal ────────────────────────────────────────────────────────────

interface ComposeModalProps {
    studentName: string;
    text: string;
    sending: boolean;
    error: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onClose: () => void;
}

const ComposeModal: React.FC<ComposeModalProps> = ({ studentName, text, sending, error, onChange, onSend, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-black text-white flex items-center gap-2">
                    <Send size={16} className="text-yellow-400" />
                    Mensagem para {studentName || 'aluno'}
                </h4>
                <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-300">
                    <X size={18} />
                </button>
            </div>
            <textarea
                aria-label={`Mensagem para ${studentName || 'aluno'}`}
                value={text}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-yellow-500/60 placeholder-neutral-600"
                placeholder="Escreva sua mensagem…"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center gap-2 justify-end">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={onSend}
                    disabled={sending || !text.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black rounded-xl disabled:opacity-50 transition-colors"
                >
                    <Send size={14} />
                    {sending ? 'Enviando…' : 'Enviar e marcar feito'}
                </button>
            </div>
        </div>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const PrioritiesTab: React.FC = () => {
    const {
        prioritiesItems,
        prioritiesLoading,
        prioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading,
        prioritiesSettingsError,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,
        fetchPriorities,
        loadPrioritiesSettings,
        savePrioritiesSettings,
        getAdminAuthHeaders,
    } = useAdminPanel();

    const [actionLoading, setActionLoading] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [sendError, setSendError] = useState('');

    // Load settings lazily when panel opens
    useEffect(() => {
        if (prioritiesSettingsOpen) void loadPrioritiesSettings();
    }, [prioritiesSettingsOpen, loadPrioritiesSettings]);

    const items = toPriorityItems(prioritiesItems as UnknownRecord[]);

    // ── Action handler ──────────────────────────────────────────────────────
    const handleAction = useCallback(async (
        studentUserId: string,
        kind: string,
        action: 'done' | 'snooze',
        snoozeMinutes = 0,
    ) => {
        const itemId = `${studentUserId}:${kind}`;
        setActionLoading(itemId);
        try {
            const headers = await getAdminAuthHeaders();
            await fetch('/api/teacher/inbox/action', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ student_user_id: studentUserId, kind, action, snooze_minutes: snoozeMinutes }),
            });
            await fetchPriorities();
        } finally {
            setActionLoading('');
        }
    }, [getAdminAuthHeaders, fetchPriorities]);

    // ── Open compose ────────────────────────────────────────────────────────
    const openCompose = useCallback((item: PriorityItem) => {
        setPrioritiesComposeStudentId(item.student_user_id);
        setPrioritiesComposeKind(item.kind);
        setPrioritiesComposeText(item.suggested_message);
        setSendError('');
        setPrioritiesComposeOpen(true);
    }, [setPrioritiesComposeStudentId, setPrioritiesComposeKind, setPrioritiesComposeText, setPrioritiesComposeOpen]);

    // ── Send message ────────────────────────────────────────────────────────
    const handleSendMessage = useCallback(async () => {
        if (!prioritiesComposeStudentId || !prioritiesComposeText.trim()) return;
        setSendingMsg(true);
        setSendError('');
        try {
            const headers = await getAdminAuthHeaders();
            const res = await fetch('/api/teacher/inbox/send-message', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ student_user_id: prioritiesComposeStudentId, content: prioritiesComposeText.trim() }),
            });
            const json: unknown = await res.json().catch(() => null);
            const jsonObj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
            if (!res.ok) {
                setSendError(String(jsonObj?.error || `Erro ${res.status}`));
                return;
            }
            // Mark as done and close
            await handleAction(prioritiesComposeStudentId, prioritiesComposeKind, 'done');
            setPrioritiesComposeOpen(false);
        } catch (e) {
            setSendError(e instanceof Error ? e.message : 'Erro ao enviar');
        } finally {
            setSendingMsg(false);
        }
    }, [
        prioritiesComposeStudentId, prioritiesComposeText, prioritiesComposeKind,
        getAdminAuthHeaders, handleAction, setPrioritiesComposeOpen,
    ]);

    // ── Save settings ───────────────────────────────────────────────────────
    const handleSaveSettings = useCallback(async () => {
        const ok = await savePrioritiesSettings();
        if (ok) {
            setPrioritiesSettingsOpen(false);
            await fetchPriorities();
        }
    }, [savePrioritiesSettings, setPrioritiesSettingsOpen, fetchPriorities]);

    // ── Compose student name lookup ─────────────────────────────────────────
    const composeItem = items.find(i => i.student_user_id === prioritiesComposeStudentId && i.kind === prioritiesComposeKind);

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-black text-white text-base flex items-center gap-2">
                        <Inbox size={18} className="text-yellow-500" />
                        Coach Inbox
                    </h3>
                    {items.length > 0 && (
                        <span className="text-[11px] font-black bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                            {items.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPrioritiesSettingsOpen(v => !v)}
                        className={`p-1.5 rounded-lg border transition-colors ${prioritiesSettingsOpen ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'}`}
                        aria-label="Configurações do inbox"
                    >
                        <Settings size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => void fetchPriorities()}
                        disabled={prioritiesLoading}
                        className="p-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white disabled:opacity-50 transition-colors"
                        aria-label="Atualizar inbox"
                    >
                        <RefreshCw size={15} className={prioritiesLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Settings panel */}
            {prioritiesSettingsOpen && (
                <SettingsPanel
                    settings={prioritiesSettings}
                    loading={prioritiesSettingsLoading}
                    error={prioritiesSettingsError}
                    onChange={(key, value) => setPrioritiesSettings(prev => ({ ...prev, [key]: value }))}
                    onSave={handleSaveSettings}
                    onClose={() => setPrioritiesSettingsOpen(false)}
                />
            )}

            {/* Loading */}
            {prioritiesLoading && (
                <div className="py-10 flex items-center justify-center text-neutral-400 gap-2 text-sm">
                    <RefreshCw size={16} className="animate-spin" />
                    Carregando…
                </div>
            )}

            {/* Error */}
            {prioritiesError && !prioritiesLoading && (
                <div className="flex flex-col items-center gap-3 py-8 text-red-400">
                    <AlertTriangle size={24} />
                    <p className="text-sm">{prioritiesError}</p>
                    <button
                        type="button"
                        onClick={() => void fetchPriorities()}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white text-xs font-bold rounded-lg"
                    >
                        Tentar novamente
                    </button>
                </div>
            )}

            {/* Items */}
            {!prioritiesLoading && !prioritiesError && (
                items.length === 0 ? (
                    <div className="py-12 flex flex-col items-center gap-2 text-neutral-400">
                        <CheckCheck size={28} />
                        <p className="text-sm font-bold">Tudo certo!</p>
                        <p className="text-xs">Nenhum alerta pendente no momento.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map(item => (
                            <ItemCard
                                key={item.id}
                                item={item}
                                isActioning={actionLoading === item.id}
                                onDone={() => void handleAction(item.student_user_id, item.kind, 'done')}
                                onSnooze={() => void handleAction(item.student_user_id, item.kind, 'snooze', prioritiesSettings.snoozeDefaultMinutes)}
                                onCompose={() => openCompose(item)}
                            />
                        ))}
                    </div>
                )
            )}

            {/* Compose modal */}
            {prioritiesComposeOpen && (
                <ComposeModal
                    studentName={composeItem?.student_name ?? ''}
                    text={prioritiesComposeText}
                    sending={sendingMsg}
                    error={sendError}
                    onChange={setPrioritiesComposeText}
                    onSend={() => void handleSendMessage()}
                    onClose={() => setPrioritiesComposeOpen(false)}
                />
            )}
        </div>
    );
};
