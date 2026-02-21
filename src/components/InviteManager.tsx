import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, Check, X } from 'lucide-react';
import Image from 'next/image';
import { useDialog } from '@/contexts/DialogContext';

interface InviteCandidate {
    id: string
    displayName: string
    photoURL: string | null
    lastSeen: string | number | null
}

interface InviteManagerProps {
    isOpen: boolean
    onClose: () => void
    onInvite: (user: InviteCandidate) => Promise<void> | void
}

const InviteManager = ({ isOpen, onClose, onInvite }: InviteManagerProps) => {
    const { alert } = useDialog();
    const alertRef = useRef(alert);
    const safeOnInvite = typeof onInvite === 'function' ? onInvite : null;
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<InviteCandidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [invitedIds, setInvitedIds] = useState(new Set());
    const [pendingIds, setPendingIds] = useState(new Set());
    const [nowMs, setNowMs] = useState(0);

    useEffect(() => {
        alertRef.current = alert;
    }, [alert]);

    useEffect(() => {
        if (!isOpen) return;
        const tick = () => setNowMs(Date.now());
        const t = setTimeout(tick, 0);
        const id = setInterval(tick, 60_000);
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        try {
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem('irontracks.inviteCache.v1') || '';
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        let items = null;
                        if (Array.isArray(parsed)) {
                            items = parsed;
                        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
                            const ts = Number(parsed.ts) || 0;
                            const maxAgeMs = 5 * 60 * 1000;
                            if (Number.isFinite(ts) && ts > 0 && (Date.now() - ts) <= maxAgeMs) {
                                items = parsed.items;
                            }
                        }
                        if (items && !cancelled) {
                            const normalized = (Array.isArray(items) ? items : []).map((item: Record<string, unknown>) => {
                                const safe = item || {};
                                const rawId = safe.id ?? safe.uid ?? safe.user_id ?? '';
                                const id = rawId ? String(rawId) : '';
                                return {
                                    id,
                                    displayName: String(safe.displayName || safe.name || safe.email || 'Atleta'),
                                    photoURL: safe.photoURL != null ? (String(safe.photoURL) || null) : (safe.photoUrl != null ? (String(safe.photoUrl) || null) : null),
                                    lastSeen: safe.lastSeen != null ? (safe.lastSeen as string | number) : null,
                                };
                            }).filter((u: Record<string, unknown>) => u && typeof u.id === 'string' && u.id.length > 0);

                            setUsers(normalized);
                        }
                    } catch { }
                }
            }
        } catch { }

        (async () => {
            await Promise.resolve();
            if (cancelled) return;
            setLoading(true);
            try {
                const res = await fetch('/api/team/invite-candidates', { method: 'GET' });
                const json = await res.json().catch(() => ({}));

                if (cancelled) return;
                if (!res.ok || !json?.ok) {
                    const errMsg = json?.error || 'Falha ao carregar atletas';
                    throw new Error(errMsg);
                }

                const list = Array.isArray(json.items) ? json.items : [];
                const normalized = list.map((item: Record<string, unknown>) => {
                    const safe = item || {};
                    const rawId = safe.id ?? safe.uid ?? safe.user_id ?? '';
                    const id = rawId ? String(rawId) : '';
                    return {
                        id,
                        displayName: String(safe.displayName || safe.name || safe.email || 'Atleta'),
                        photoURL: safe.photoURL != null ? (String(safe.photoURL) || null) : (safe.photoUrl != null ? (String(safe.photoUrl) || null) : null),
                        lastSeen: safe.lastSeen != null ? (safe.lastSeen as string | number) : null,
                    };
                }).filter((u: Record<string, unknown>) => u && typeof u.id === 'string' && u.id.length > 0);

                setUsers(normalized);

                try {
                    if (typeof window !== 'undefined') {
                        const payload = { ts: Date.now(), items: list };
                        window.localStorage.setItem('irontracks.inviteCache.v1', JSON.stringify(payload));
                    }
                } catch { }
            } catch (e) {
                if (!cancelled) {
                    const msg = (e as Error)?.message || String(e || '');
                    await alertRef.current('Erro ao carregar usuários: ' + msg);
                    setUsers([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [isOpen]);

    // Simple search function - In a real app with many users, this should be server-side search
    // Supabase supports text search, but for migration speed we'll filter client-side the fetched list
    // OR fetch by search term if provided.
    useEffect(() => {
        if (!isOpen) return;
        const term = String(searchTerm || '').trim();
        if (!term) return;
        if (term.length < 2) return;

        const searchProfiles = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('q', term);

                const res = await fetch(`/api/team/invite-candidates?${params.toString()}`, { method: 'GET' });
                const json = await res.json().catch(() => ({}));

                if (!res.ok || !json?.ok) {
                    const errMsg = json?.error || 'Falha ao buscar atletas';
                    throw new Error(errMsg);
                }

                const list = Array.isArray(json.items) ? json.items : [];
                const normalized = list.map((item: Record<string, unknown>) => {
                    const safe = item || {};
                    const rawId = safe.id ?? safe.uid ?? safe.user_id ?? '';
                    const id = rawId ? String(rawId) : '';
                    return {
                        id,
                        displayName: String(safe.displayName || safe.name || safe.email || 'Atleta'),
                        photoURL: safe.photoURL != null ? (String(safe.photoURL) || null) : (safe.photoUrl != null ? (String(safe.photoUrl) || null) : null),
                        lastSeen: safe.lastSeen != null ? (safe.lastSeen as string | number) : null,
                    };
                }).filter((u: Record<string, unknown>) => u && typeof u.id === 'string' && u.id.length > 0);

                setUsers(normalized);

                try {
                    if (typeof window !== 'undefined') {
                        const payload = { ts: Date.now(), items: list };
                        window.localStorage.setItem('irontracks.inviteCache.v1', JSON.stringify(payload));
                    }
                } catch { }
            } catch (e) {
                const msg = (e as Error)?.message || String(e || '');
                await alertRef.current('Erro ao buscar usuários: ' + msg);
                setUsers([]);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(searchProfiles, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, isOpen]);

    const handleInvite = async (user: InviteCandidate) => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;
        if (!safeOnInvite) return;
        if (pendingIds.has(userId) || invitedIds.has(userId)) return;
        try {
            setPendingIds((prev) => {
                const next = new Set(prev);
                next.add(userId);
                return next;
            });
            await safeOnInvite(user);
            setInvitedIds((prev) => {
                const next = new Set(prev);
                next.add(userId);
                return next;
            });
        } catch (e) {
            const msg = (e as Error)?.message || String(e || '');
            await alert("Erro ao enviar: " + msg);
        } finally {
            setPendingIds((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const isOnline = (lastSeen: string | number | null) => {
        try {
            if (!lastSeen || !nowMs) return false;
            const ts = new Date(lastSeen).getTime();
            if (!Number.isFinite(ts)) return false;
            const diff = nowMs - ts;
            if (!Number.isFinite(diff) || diff <= 0) return false;
            return diff < 10 * 60 * 1000;
        } catch {
            return false;
        }
    };

    const getLastSeenText = (lastSeen: string | number | null) => {
        try {
            if (!lastSeen) return 'Nunca';
            if (!nowMs) return '...';
            const ts = new Date(lastSeen).getTime();
            if (!Number.isFinite(ts)) return 'Nunca';
            const diff = nowMs - ts;
            if (!Number.isFinite(diff) || diff <= 0) return 'Nunca';
            const minutes = Math.floor(diff / 60000);
            if (minutes < 1) return 'Agora';
            if (minutes < 60) return `${minutes} min`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h`;
            return 'Dias atrás';
        } catch {
            return 'Nunca';
        }
    };

    // Filter logic is now handled by effect + server query mostly, 
    // but we can still filter the displayed list if needed.
    // Since we update `users` state directly from search, we just iterate `users`.

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-800/50 rounded-t-2xl">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <UserPlus className="text-yellow-500" size={20} />
                        Convidar Parceiro
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-700 rounded-full transition-colors">
                        <X size={20} className="text-neutral-400" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-neutral-500" size={18} />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar atleta..."
                            className="w-full bg-neutral-800 text-white pl-10 pr-4 py-3 rounded-xl outline-none focus:ring-2 ring-yellow-500/50 transition-all placeholder:text-neutral-600"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2 custom-scrollbar">
                    {loading && (
                        <div className="text-center py-8 text-neutral-500 animate-pulse">
                            Carregando atletas...
                        </div>
                    )}

                    {!loading && users.length === 0 && (
                        <div className="text-center py-8 text-neutral-500">
                            Nenhum atleta encontrado.
                        </div>
                    )}

                    {Array.isArray(users) && users.filter(u => u && typeof u.id === 'string' && u.id.length > 0).map(user => {
                        const online = isOnline(user.lastSeen);
                        const userId = String(user.id);
                        const invited = invitedIds.has(userId);
                        const pending = pendingIds.has(userId);

                        return (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-xl transition-colors group border border-transparent hover:border-neutral-700">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        {user.photoURL ? (
                                            <Image src={user.photoURL} width={40} height={40} className="rounded-full object-cover bg-neutral-700" alt={user.displayName} />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-neutral-400">
                                                {user.displayName?.[0]}
                                            </div>
                                        )}
                                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-neutral-900 ${online ? 'bg-green-500' : 'bg-neutral-600'}`}></div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{user.displayName || 'Atleta'}</h4>
                                        <p className="text-[10px] text-neutral-500 font-mono">ID: {(typeof user.id === 'string' ? user.id : String(user.id ?? '')).slice(0, 8) || '--------'}...</p>
                                        <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                                            {online ? (
                                                <span className="text-green-500 flex items-center gap-1">Online agora</span>
                                            ) : (
                                                <span>Offline ({getLastSeenText(user.lastSeen)})</span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => (!invited && !pending) && handleInvite(user)}
                                    disabled={invited || pending}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${invited
                                        ? 'bg-green-500/20 text-green-500 cursor-default'
                                        : pending
                                            ? 'bg-neutral-700 text-white cursor-wait'
                                            : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-lg shadow-yellow-500/20'
                                        }`}
                                >
                                    {invited
                                        ? (<><Check size={14} /> Enviado</>)
                                        : pending
                                            ? (<>Aguardando...</>)
                                            : (<><UserPlus size={14} /> Convidar</>)}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default InviteManager;
