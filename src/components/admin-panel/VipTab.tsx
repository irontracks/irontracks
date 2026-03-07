'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Crown, Search, Loader2, Filter, RefreshCw,
    UserPlus, XCircle, ChevronDown, Calendar, Shield,
    Zap, Star, Trophy, AlertCircle, Check, Users
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────
type VipItem = {
    id: string
    user_id: string
    email: string
    name: string
    role: string
    tier: string
    plan_id: string | null
    status: string | null
    provider: string | null
    valid_from: string | null
    valid_until: string | null
    current_period_end: string | null
    created_at: string | null
}

type TierFilter = 'all' | 'vip_start' | 'vip_pro' | 'vip_elite'

// ─── Constants ────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType; dot: string }> = {
    vip_start: { label: 'START', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', icon: Zap, dot: 'bg-yellow-400' },
    vip_pro: { label: 'PRO', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25', icon: Star, dot: 'bg-green-400' },
    vip_elite: { label: 'ELITE', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/25', icon: Trophy, dot: 'bg-purple-400' },
}

const SOURCE_LABELS: Record<string, string> = {
    admin_grant: 'Concedido',
    app_subscription: 'Assinatura',
    stripe: 'Stripe',
    apple: 'Apple',
    play_store: 'Play Store',
}

// ─── Tier Badge ───────────────────────────────────────────────────
const TierBadge = ({ tier, size = 'md' }: { tier: string; size?: 'sm' | 'md' | 'lg' }) => {
    const config = TIER_CONFIG[tier]
    if (!config) return <span className="text-[10px] text-neutral-500 uppercase font-bold">FREE</span>
    const Icon = config.icon
    const sizeClass = size === 'sm' ? 'text-[9px] px-1.5 py-0.5 gap-0.5' : size === 'lg' ? 'text-sm px-3 py-1.5 gap-1.5' : 'text-[10px] px-2 py-1 gap-1'
    return (
        <span className={`inline-flex items-center rounded-full font-black uppercase tracking-wider border ${config.bg} ${config.color} ${config.border} ${sizeClass}`}>
            <Icon size={size === 'sm' ? 8 : size === 'lg' ? 16 : 11} />
            {config.label}
        </span>
    )
}

// ─── Grant Modal ──────────────────────────────────────────────────
const GrantModal = ({ open, onClose, onGrant }: {
    open: boolean
    onClose: () => void
    onGrant: (email: string, plan: string, days: number) => Promise<void>
}) => {
    const [email, setEmail] = useState('')
    const [plan, setPlan] = useState<'vip_start' | 'vip_pro' | 'vip_elite'>('vip_pro')
    const [days, setDays] = useState(30)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    if (!open) return null

    const handleGrant = async () => {
        if (!email.trim()) return
        setLoading(true)
        setResult(null)
        try {
            await onGrant(email.trim(), plan, days)
            setResult('✅ VIP concedido com sucesso!')
            setEmail('')
        } catch (e) {
            setResult(`❌ Erro: ${e instanceof Error ? e.message : 'falha'}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }} onClick={onClose}>
            <div className="rounded-3xl w-full max-w-md p-6 space-y-5" style={{ background: 'rgba(10,10,10,0.99)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 40px rgba(234,179,8,0.07), 0 32px 80px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 flex items-center justify-center">
                            <Crown size={18} className="text-yellow-400" />
                        </div>
                        <div>
                            <h3 className="font-black text-white text-lg">Conceder VIP</h3>
                            <p className="text-[11px] text-neutral-500">Adicionar acesso VIP a um usuário</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                        <XCircle size={20} />
                    </button>
                </div>

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 block">E-mail do usuário</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="usuario@email.com"
                            className="w-full bg-neutral-800/60 border border-neutral-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder:text-neutral-600 focus:border-yellow-500/60 focus:outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 block">Plano</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['vip_start', 'vip_pro', 'vip_elite'] as const).map(p => {
                                const cfg = TIER_CONFIG[p]
                                const Icon = cfg.icon
                                const active = plan === p
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setPlan(p)}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all active:scale-95 ${active
                                            ? `${cfg.bg} ${cfg.border} ${cfg.color} ring-2 ring-offset-1 ring-offset-neutral-900 ring-${p === 'vip_start' ? 'yellow' : p === 'vip_pro' ? 'green' : 'purple'}-500/50`
                                            : 'bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:border-neutral-600'}`}
                                    >
                                        <Icon size={18} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">{cfg.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 block">Duração (dias)</label>
                        <div className="flex gap-2">
                            {[7, 14, 30, 90, 365].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${days === d
                                        ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                                        : 'bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:border-neutral-600'}`}
                                >
                                    {d}d
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Result */}
                {result && (
                    <div className={`text-sm font-semibold px-3 py-2 rounded-xl ${result.startsWith('✅') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {result}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-neutral-700 text-neutral-400 font-bold text-sm hover:bg-neutral-800 transition-all active:scale-95">
                        Cancelar
                    </button>
                    <button
                        onClick={handleGrant}
                        disabled={!email.trim() || loading}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black text-sm transition-all active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Crown size={14} />}
                        Conceder
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────
export const VipTab: React.FC = () => {
    const [items, setItems] = useState<VipItem[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [tierFilter, setTierFilter] = useState<TierFilter>('all')
    const [grantOpen, setGrantOpen] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)

    // ─── Fetch VIP list ──────────────────────────────────────────
    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/vip/list', { credentials: 'include', cache: 'no-store' })
            const data = await res.json()
            if (data?.ok && Array.isArray(data.items)) {
                setItems(data.items)
            }
        } catch { /* silent */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchList() }, [fetchList])

    // ─── Filter + Search ─────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = items
        if (tierFilter !== 'all') {
            list = list.filter(i => i.tier === tierFilter)
        }
        if (query.trim()) {
            const q = query.toLowerCase()
            list = list.filter(i =>
                (i.name || '').toLowerCase().includes(q) ||
                (i.email || '').toLowerCase().includes(q)
            )
        }
        return list
    }, [items, tierFilter, query])

    // ─── Stats ───────────────────────────────────────────────────
    const stats = useMemo(() => {
        const counts: Record<string, number> = { vip_start: 0, vip_pro: 0, vip_elite: 0 }
        for (const i of items) {
            if (counts[i.tier] !== undefined) counts[i.tier]++
        }
        return counts
    }, [items])

    // ─── Grant VIP ───────────────────────────────────────────────
    const handleGrant = async (email: string, plan: string, days: number) => {
        const res = await fetch('/api/admin/vip/grant-trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: [{ email, plan_id: plan, days }] }),
        })
        const data = await res.json()
        if (!data?.ok) throw new Error(data?.error || 'Falha ao conceder')
        const r = Array.isArray(data.results) ? data.results[0] : null
        if (r && !r.ok) throw new Error(r.error || 'Falha ao conceder')
        await fetchList()
    }

    // ─── Revoke VIP ──────────────────────────────────────────────
    const handleRevoke = async (item: VipItem) => {
        if (!window.confirm(`Revogar VIP de ${item.name || item.email}?`)) return
        setRevoking(item.id)
        try {
            await fetch('/api/admin/vip/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ entitlement_id: item.id }),
            })
            await fetchList()
        } catch { /* silent */ }
        finally { setRevoking(null) }
    }

    // ─── Render ──────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* ─── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-purple-500/10 border border-yellow-500/30 flex items-center justify-center shadow-lg shadow-yellow-500/10">
                        <Crown size={22} className="text-yellow-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white">Gestão VIP</h2>
                        <p className="text-[11px] text-neutral-500">{items.length} assinantes ativos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchList}
                        className="w-9 h-9 rounded-xl bg-neutral-800/60 border border-neutral-700/60 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
                        title="Atualizar"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setGrantOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-xl text-[12px] uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                    >
                        <UserPlus size={14} />
                        Conceder VIP
                    </button>
                </div>
            </div>

            {/* ─── Stats Cards ────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                {(['vip_start', 'vip_pro', 'vip_elite'] as const).map(tier => {
                    const cfg = TIER_CONFIG[tier]
                    const Icon = cfg.icon
                    const count = stats[tier] || 0
                    return (
                        <button
                            key={tier}
                            onClick={() => setTierFilter(tierFilter === tier ? 'all' : tier)}
                            className={`relative overflow-hidden p-4 rounded-2xl border transition-all active:scale-[0.98] text-left ${tierFilter === tier
                                ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-offset-neutral-950 ring-${tier === 'vip_start' ? 'yellow' : tier === 'vip_pro' ? 'green' : 'purple'}-500/50`
                                : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'}`}
                        >
                            <div className="absolute top-2 right-2 opacity-10">
                                <Icon size={40} />
                            </div>
                            <div className="relative">
                                <div className={`text-[10px] font-black uppercase tracking-widest ${cfg.color} mb-1`}>{cfg.label}</div>
                                <div className="text-3xl font-black text-white">{count}</div>
                                <div className="text-[11px] text-neutral-500 mt-0.5">assinantes</div>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* ─── Search + Filter ────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="relative flex-1 w-full">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                        type="text"
                        placeholder="Buscar VIP por nome ou e-mail…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full bg-neutral-900/60 border border-neutral-800 rounded-2xl pl-11 pr-4 py-3 text-white text-sm placeholder:text-neutral-600 focus:border-yellow-500/60 focus:outline-none transition-all"
                    />
                </div>
                {tierFilter !== 'all' && (
                    <button
                        onClick={() => setTierFilter('all')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-neutral-400 hover:text-white text-xs font-bold transition-all active:scale-95"
                    >
                        <Filter size={12} />
                        Limpar filtro
                    </button>
                )}
            </div>

            {/* ─── VIP List ───────────────────────────────────────── */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-yellow-500" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-neutral-800 rounded-3xl">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Crown size={28} className="text-neutral-700" />
                    </div>
                    <div className="font-black text-white text-base mb-1">
                        {query ? 'Nenhum resultado' : items.length === 0 ? 'Nenhum VIP ativo' : 'Nenhum VIP neste filtro'}
                    </div>
                    <p className="text-neutral-500 text-sm">
                        {query ? `Nada encontrado para "${query}".` : 'Conceda acesso VIP para começar.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(item => {
                        const cfg = TIER_CONFIG[item.tier]
                        const isExpiring = item.valid_until ? (new Date(item.valid_until).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000 : false
                        const isRevoking = revoking === item.id

                        return (
                            <div
                                key={item.id}
                                className={`group relative bg-neutral-900/60 border rounded-2xl p-4 transition-all hover:bg-neutral-900/90 ${isExpiring ? 'border-amber-500/30' : 'border-neutral-800/80 hover:border-neutral-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 border ${cfg
                                        ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}
                                    >
                                        {(item.name || item.email || '?').charAt(0).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white text-sm truncate">{item.name || item.email || 'Sem Nome'}</span>
                                            <TierBadge tier={item.tier} size="sm" />
                                            {isExpiring && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                                    <AlertCircle size={8} />
                                                    Expirando
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-neutral-500">
                                            <span className="truncate">{item.email}</span>
                                            {item.valid_until && (
                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                    <Calendar size={10} />
                                                    Até {new Date(item.valid_until).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                            {item.provider && (
                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                    <Shield size={10} />
                                                    {SOURCE_LABELS[item.provider] || item.provider}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <button
                                        onClick={() => handleRevoke(item)}
                                        disabled={isRevoking}
                                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                                        title="Revogar VIP"
                                    >
                                        {isRevoking ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={14} />}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ─── Grant Modal ────────────────────────────────────── */}
            <GrantModal
                open={grantOpen}
                onClose={() => setGrantOpen(false)}
                onGrant={handleGrant}
            />
        </div>
    )
}
