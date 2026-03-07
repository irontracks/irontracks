import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, Download, Upload, Trash2, MessageSquare, Database, RefreshCw, ChevronDown, FileText } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';

export const SystemTab: React.FC = () => {
    const {
        isAdmin,
        dangerOpen,
        setDangerOpen,
        dangerActionLoading,
        dangerStudentsConfirm,
        setDangerStudentsConfirm,
        dangerTeachersConfirm,
        setDangerTeachersConfirm,
        dangerWorkoutsConfirm,
        setDangerWorkoutsConfirm,
        systemExporting,
        systemImporting,
        systemFileInputRef,
        broadcastTitle,
        setBroadcastTitle,
        broadcastMsg,
        setBroadcastMsg,
        sendingBroadcast,
        handleSendBroadcast,
        exerciseAliasesReview,
        exerciseAliasesLoading,
        exerciseAliasesError,
        exerciseAliasesBackfillLoading,
        exerciseAliasesNotice,
        usersList,
        getAdminAuthHeaders,
        handleExportSystem,
        handleImportSystem,
        runDangerAction,
    } = useAdminPanel();

    const [grantEmail, setGrantEmail] = useState('');
    const [grantUserId, setGrantUserId] = useState('');
    const [grantPlan, setGrantPlan] = useState<'vip_start' | 'vip_pro' | 'vip_elite'>('vip_pro');
    const [grantDays, setGrantDays] = useState(3);
    const [grantList, setGrantList] = useState<Array<{ id: string; email: string; user_id: string; plan_id: 'vip_start' | 'vip_pro' | 'vip_elite'; days: number }>>([]);
    const [grantBusy, setGrantBusy] = useState(false);
    const [grantError, setGrantError] = useState('');
    const [grantResults, setGrantResults] = useState<Array<Record<string, unknown>>>([]);
    const [grantHistory, setGrantHistory] = useState<Array<Record<string, unknown>>>([]);
    const [grantHistoryLoading, setGrantHistoryLoading] = useState(false);
    const [grantHistoryError, setGrantHistoryError] = useState('');
    const [selectedStudentKey, setSelectedStudentKey] = useState('');
    const [vipCheckLoading, setVipCheckLoading] = useState(false);
    const [vipCheckError, setVipCheckError] = useState('');
    const [vipCheckTier, setVipCheckTier] = useState('');
    const vipCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const studentOptions = useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list
            .map((s) => {
                const id = String((s as Record<string, unknown>)?.user_id || (s as Record<string, unknown>)?.id || '').trim();
                const email = String((s as Record<string, unknown>)?.email || '').trim().toLowerCase();
                const name = String((s as Record<string, unknown>)?.name || (s as Record<string, unknown>)?.display_name || '').trim();
                if (!id && !email) return null;
                const key = `${id || 'id'}|${email || ''}`;
                const label = [name || 'Aluno', email || id].filter(Boolean).join(' • ');
                return { key, id, email, label };
            })
            .filter(Boolean) as Array<{ key: string; id: string; email: string; label: string }>;
    }, [usersList]);

    const loadGrantHistory = useCallback(async () => {
        setGrantHistoryLoading(true);
        setGrantHistoryError('');
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/admin/vip/grant-history?limit=80', { headers: { ...(authHeaders || {}) } });
            const json = await res.json().catch(() => null) as Record<string, unknown> | null;
            if (!res.ok || !json?.ok) {
                setGrantHistoryError(String(json?.error || `Falha ao carregar histórico (${res.status})`));
                setGrantHistory([]);
                return;
            }
            const rows = Array.isArray(json?.rows) ? (json?.rows as Record<string, unknown>[]) : [];
            setGrantHistory(rows);
        } catch (e: unknown) {
            setGrantHistoryError(String((e as Record<string, unknown>)?.message || e));
            setGrantHistory([]);
        } finally {
            setGrantHistoryLoading(false);
        }
    }, [getAdminAuthHeaders]);

    useEffect(() => {
        loadGrantHistory();
    }, [loadGrantHistory]);

    const canAddGrant = useMemo(() => {
        const daysOk = Number.isFinite(Number(grantDays)) && Number(grantDays) > 0 && Number(grantDays) <= 365;
        const hasTarget = String(grantEmail || '').trim() || String(grantUserId || '').trim();
        return !!daysOk && !!hasTarget;
    }, [grantDays, grantEmail, grantUserId]);

    const handleAddGrant = () => {
        const email = String(grantEmail || '').trim().toLowerCase();
        const user_id = String(grantUserId || '').trim();
        const days = Math.max(1, Math.min(365, Number(grantDays) || 1));
        if (!email && !user_id) {
            setGrantError('Informe email ou user_id.');
            return;
        }
        setGrantError('');
        setGrantList((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                email,
                user_id,
                plan_id: grantPlan,
                days,
            },
        ]);
        setGrantEmail('');
        setGrantUserId('');
        setGrantDays(3);
    };

    const handleSubmitGrants = async () => {
        if (!grantList.length || grantBusy) return;
        setGrantBusy(true);
        setGrantError('');
        setGrantResults([]);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/admin/vip/grant-trial', {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(authHeaders || {}) },
                body: JSON.stringify({ grants: grantList.map((g) => ({ email: g.email || undefined, user_id: g.user_id || undefined, plan_id: g.plan_id, days: g.days })) }),
            });
            const json = await res.json().catch(() => null) as Record<string, unknown> | null;
            if (!res.ok || !json?.ok) {
                setGrantError(String(json?.error || `Falha ao doar degustações (${res.status})`));
                return;
            }
            const results = Array.isArray(json?.results) ? (json?.results as Record<string, unknown>[]) : [];
            setGrantResults(results);
            setGrantList([]);
            loadGrantHistory();
        } catch (e: unknown) {
            setGrantError(String((e as Record<string, unknown>)?.message || e));
        } finally {
            setGrantBusy(false);
        }
    };

    const handleSelectStudent = (value: string) => {
        setSelectedStudentKey(value);
        const found = studentOptions.find((s) => s.key === value);
        if (found) {
            if (found.email) setGrantEmail(found.email);
            if (found.id) setGrantUserId(found.id);
        }
    };

    const loadVipStatus = useCallback(async (targetId: string, targetEmail: string) => {
        setVipCheckLoading(true);
        setVipCheckError('');
        setVipCheckTier('');
        try {
            const authHeaders = await getAdminAuthHeaders();
            const qs = new URLSearchParams();
            if (targetId) qs.set('id', targetId);
            if (!targetId && targetEmail) qs.set('email', targetEmail);
            const res = await fetch(`/api/admin/vip/entitlement?${qs.toString()}`, { headers: { ...(authHeaders || {}) } });
            const json = await res.json().catch(() => null) as Record<string, unknown> | null;
            if (!res.ok || !json?.ok) {
                setVipCheckError(String(json?.error || `Falha ao checar VIP (${res.status})`));
                return;
            }
            const entitlement = json?.entitlement && typeof json.entitlement === 'object' ? (json.entitlement as Record<string, unknown>) : null;
            const tier = String(entitlement?.tier || '').trim();
            setVipCheckTier(tier);
        } catch (e: unknown) {
            setVipCheckError(String((e as Record<string, unknown>)?.message || e));
        } finally {
            setVipCheckLoading(false);
        }
    }, [getAdminAuthHeaders]);

    useEffect(() => {
        const targetId = String(grantUserId || '').trim();
        const targetEmail = String(grantEmail || '').trim().toLowerCase();
        if (!targetId && !targetEmail) {
            setVipCheckTier('');
            setVipCheckError('');
            setVipCheckLoading(false);
            if (vipCheckTimerRef.current) clearTimeout(vipCheckTimerRef.current);
            return;
        }
        if (vipCheckTimerRef.current) clearTimeout(vipCheckTimerRef.current);
        vipCheckTimerRef.current = setTimeout(() => {
            loadVipStatus(targetId, targetEmail);
        }, 400);
        return () => {
            if (vipCheckTimerRef.current) clearTimeout(vipCheckTimerRef.current);
        };
    }, [grantUserId, grantEmail, loadVipStatus]);

    // handleUpdateAliases placeholder (aliases backfill not yet implemented in controller)
    const handleUpdateAliases = async () => {
        alert('Funcionalidade de aliases em implementação');
    };

    if (!isAdmin) return <div className="p-4 text-red-500">Acesso negado.</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Backup & Restore */}
            <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                <h3 className="font-black text-white text-lg mb-4 flex items-center gap-2">
                    <Database size={20} className="text-yellow-500" />
                    Backup & Restore
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={handleExportSystem}
                        disabled={systemExporting}
                        className="p-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                    >
                        <Download size={20} className="text-blue-400" />
                        <div className="text-left">
                            <div className="font-bold text-white">Exportar Backup</div>
                            <div className="text-xs text-neutral-400">Baixar JSON completo do sistema</div>
                        </div>
                    </button>
                    
                    <div className="relative">
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleImportSystem}
                            disabled={systemImporting}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <button
                            disabled={systemImporting}
                            className="w-full h-full p-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                        >
                            <Upload size={20} className="text-green-400" />
                            <div className="text-left">
                                <div className="font-bold text-white">Restaurar Backup</div>
                                <div className="text-xs text-neutral-400">Carregar arquivo JSON</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Broadcast */}
            <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                <h3 className="font-black text-white text-lg mb-4 flex items-center gap-2">
                    <MessageSquare size={20} className="text-yellow-500" />
                    Broadcast (Aviso Geral)
                </h3>
                <div className="space-y-3">
                    <input
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        placeholder="Título do aviso"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                    />
                    <textarea
                        value={broadcastMsg}
                        onChange={(e) => setBroadcastMsg(e.target.value)}
                        placeholder="Mensagem para todos os usuários..."
                        rows={3}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                    />
                    <button
                        onClick={handleSendBroadcast}
                        disabled={sendingBroadcast || !broadcastTitle || !broadcastMsg}
                        className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl transition-all disabled:opacity-50 active:scale-95"
                    >
                        {sendingBroadcast ? 'Enviando...' : 'Enviar Aviso'}
                    </button>
                </div>
            </div>

            <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                <h3 className="font-black text-white text-lg mb-4 flex items-center gap-2">
                    <FileText size={20} className="text-yellow-500" />
                    Degustações VIP
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Aluno cadastrado</label>
                        <select
                            value={selectedStudentKey}
                            onChange={(e) => handleSelectStudent(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        >
                            <option value="">Selecionar aluno</option>
                            {studentOptions.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Email do aluno</label>
                        <input
                            value={grantEmail}
                            onChange={(e) => setGrantEmail(e.target.value)}
                            placeholder="ex: aluno@email.com"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">user_id do aluno</label>
                        <input
                            value={grantUserId}
                            onChange={(e) => setGrantUserId(e.target.value)}
                            placeholder="UUID do usuário (opcional)"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Plano da degustação</label>
                        <select
                            value={grantPlan}
                            onChange={(e) => setGrantPlan(e.target.value as 'vip_start' | 'vip_pro' | 'vip_elite')}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        >
                            <option value="vip_start">VIP Start</option>
                            <option value="vip_pro">VIP Pro</option>
                            <option value="vip_elite">VIP Elite</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Dias de degustação</label>
                        <input
                            value={grantDays}
                            onChange={(e) => setGrantDays(Number(e.target.value) || 1)}
                            type="number"
                            min={1}
                            max={365}
                            placeholder="Quantidade de dias"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={handleAddGrant}
                        disabled={!canAddGrant}
                        className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95 disabled:opacity-60"
                    >
                        Adicionar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmitGrants}
                        disabled={!grantList.length || grantBusy}
                        className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-all duration-300 active:scale-95 disabled:opacity-60"
                    >
                        {grantBusy ? 'Aplicando...' : 'Doar degustações'}
                    </button>
                </div>
                {grantError ? (
                    <div className="mt-3 text-sm text-red-300">{grantError}</div>
                ) : null}
                {vipCheckLoading ? (
                    <div className="mt-2 text-xs text-neutral-400">Checando VIP...</div>
                ) : null}
                {vipCheckError ? (
                    <div className="mt-2 text-sm text-red-300">{vipCheckError}</div>
                ) : null}
                {vipCheckTier && vipCheckTier !== 'free' ? (
                    <div className="mt-2 text-sm text-yellow-200 border border-yellow-500/30 bg-yellow-500/10 rounded-xl px-3 py-2">
                        Este aluno já é VIP ({vipCheckTier.replace('vip_', 'VIP ').toUpperCase()}).
                    </div>
                ) : null}
                {grantList.length ? (
                    <div className="mt-4 space-y-2">
                        {grantList.map((g) => (
                            <div key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-200">
                                <div className="min-w-0">
                                    <div className="text-xs text-neutral-400">{g.email || g.user_id}</div>
                                    <div className="font-semibold text-white">{g.plan_id.replace('vip_', 'VIP ').toUpperCase()} · {g.days} dia(s)</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setGrantList((prev) => prev.filter((x) => x.id !== g.id))}
                                    className="text-xs text-neutral-400 hover:text-white"
                                >
                                    Remover
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}
                {grantResults.length ? (
                    <div className="mt-4 space-y-2">
                        {grantResults.map((r, idx) => {
                            const ok = !!r?.ok;
                            const label = String(r?.email || r?.user_id || '').trim() || 'aluno';
                            const plan = String(r?.plan_id || '').replace('vip_', 'VIP ').toUpperCase();
                            const msg = ok ? `OK · ${label} · ${plan}` : `Erro · ${label} · ${String(r?.error || 'falha')}`;
                            return (
                                <div key={`${idx}-${label}`} className={`rounded-xl border px-3 py-2 text-sm ${ok ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
                                    {msg}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <div className="mt-6 flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 font-bold">Histórico</div>
                    <button
                        type="button"
                        onClick={loadGrantHistory}
                        disabled={grantHistoryLoading}
                        className="min-h-[36px] px-3 py-2 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95 disabled:opacity-60"
                    >
                        {grantHistoryLoading ? 'Atualizando...' : 'Atualizar'}
                    </button>
                </div>
                {grantHistoryError ? (
                    <div className="mt-2 text-sm text-red-300">{grantHistoryError}</div>
                ) : null}
                {grantHistory.length ? (
                    <div className="mt-3 space-y-2">
                        {grantHistory.map((r, idx) => {
                            const meta = r?.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {};
                            const plan = String(meta?.plan_id || '').replace('vip_', 'VIP ').toUpperCase();
                            const days = Number(meta?.days) || 0;
                            const email = String(meta?.email || r?.actor_email || '').trim();
                            const createdAt = String(r?.created_at || '');
                            const label = String(r?.entity_id || '').trim();
                            return (
                                <div key={`${idx}-${label}-${createdAt}`} className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-200">
                                    <div className="text-xs text-neutral-400">{createdAt}</div>
                                    <div className="font-semibold text-white">{email || label} · {plan} · {days} dia(s)</div>
                                </div>
                            );
                        })}
                    </div>
                ) : !grantHistoryLoading ? (
                    <div className="mt-3 text-sm text-neutral-400">Sem histórico ainda.</div>
                ) : null}
            </div>

            {/* Danger Zone */}
            <div className="bg-red-950/20 p-6 rounded-2xl border border-red-900/50 shadow-sm backdrop-blur-sm">
                <button
                    onClick={() => setDangerOpen(!dangerOpen)}
                    className="w-full flex items-center justify-between group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-900/30 rounded-lg border border-red-500/30 group-hover:bg-red-900/50 transition-colors">
                            <ShieldAlert size={24} className="text-red-500" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-black text-red-500 text-lg">Danger Zone</h3>
                            <p className="text-xs text-red-400/70">Ações irreversíveis e destrutivas</p>
                        </div>
                    </div>
                    <ChevronDown size={20} className={`text-red-500 transition-transform ${dangerOpen ? 'rotate-180' : ''}`} />
                </button>

                {dangerOpen && (
                    <div className="mt-6 space-y-4 animate-in slide-in-from-top-2">
                        {/* Students Danger */}
                        <div className="bg-red-900/20 border border-red-900/30 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-red-400 flex items-center gap-2">
                                    <Trash2 size={16} /> Zerar Alunos
                                </h4>
                                <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-[10px] uppercase font-bold rounded border border-red-900">Irreversível</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={dangerStudentsConfirm}
                                    onChange={(e) => setDangerStudentsConfirm(e.target.value)}
                                    placeholder="Digite APAGAR"
                                    className="flex-1 bg-neutral-950 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                                />
                                <button
                                    disabled={dangerStudentsConfirm.toUpperCase() !== 'APAGAR' || dangerActionLoading === 'students'}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs uppercase"
                                >
                                    Apagar Tudo
                                </button>
                            </div>
                        </div>

                         {/* Teachers Danger */}
                         <div className="bg-red-900/20 border border-red-900/30 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-red-400 flex items-center gap-2">
                                    <Trash2 size={16} /> Zerar Professores
                                </h4>
                                <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-[10px] uppercase font-bold rounded border border-red-900">Irreversível</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={dangerTeachersConfirm}
                                    onChange={(e) => setDangerTeachersConfirm(e.target.value)}
                                    placeholder="Digite APAGAR"
                                    className="flex-1 bg-neutral-950 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                                />
                                <button
                                    disabled={dangerTeachersConfirm.toUpperCase() !== 'APAGAR' || dangerActionLoading === 'teachers'}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs uppercase"
                                >
                                    Apagar Tudo
                                </button>
                            </div>
                        </div>

                        {/* Workouts Danger */}
                        <div className="bg-red-900/20 border border-red-900/30 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-red-400 flex items-center gap-2">
                                    <Trash2 size={16} /> Zerar Treinos
                                </h4>
                                <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-[10px] uppercase font-bold rounded border border-red-900">Irreversível</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={dangerWorkoutsConfirm}
                                    onChange={(e) => setDangerWorkoutsConfirm(e.target.value)}
                                    placeholder="Digite APAGAR"
                                    className="flex-1 bg-neutral-950 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                                />
                                <button
                                    disabled={dangerWorkoutsConfirm.toUpperCase() !== 'APAGAR' || dangerActionLoading === 'workouts'}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs uppercase"
                                >
                                    Apagar Tudo
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
