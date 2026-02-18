'use client'

import React, { useEffect, useState } from 'react'
import { Check, X, Loader2, Calendar, Mail, Phone, User, Clock, GraduationCap } from 'lucide-react'
import { useDialog } from '@/contexts/DialogContext'

interface AccessRequest {
    id: string
    user_id?: string
    full_name: string
    email?: string
    phone?: string
    birth_date?: string
    role_requested?: string
    cref?: string
    status: 'pending' | 'approved' | 'rejected' | string
    created_at: string
    [key: string]: unknown
}

export default function RequestsTab() {
    const { confirm, alert } = useDialog()
    const [requests, setRequests] = useState<AccessRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState<string | null>(null) // id being processed

    const fetchRequests = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/access-requests/list?status=pending')
            const json = await res.json()
            if (json.ok) {
                setRequests((json.data || []) as AccessRequest[])
            } else {
                console.error(json.error)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchRequests()
    }, [])

    const handleAction = async (req: AccessRequest, action: string) => {
        if (action === 'reject') {
            const ok = await confirm(
                `Tem certeza que deseja recusar o acesso de ${req.full_name}?`,
                'Recusar Solicitação',
                { confirmText: 'Recusar', cancelText: 'Cancelar', type: 'danger' }
            )
            if (!ok) return
        } else {
            const ok = await confirm(
                `Aceitar solicitação de ${req.full_name}?\nIsso vai liberar o acesso e enviar um e-mail de aprovação.`,
                'Aceitar Acesso',
                { confirmText: 'Aprovar', cancelText: 'Cancelar' }
            )
            if (!ok) return
        }

        setProcessing(req.id)
        try {
            const res = await fetch('/api/admin/access-requests/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: req.id, action })
            })
            const json = await res.json()

            if (json.ok) {
                await alert(json.message || 'Sucesso!')
                setRequests(prev => prev.filter(r => r.id !== req.id))
            } else {
                await alert(json.error || 'Erro ao processar.')
            }
        } catch (e) {
            await alert('Erro de conexão.')
        } finally {
            setProcessing(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-yellow-500" size={32} />
            </div>
        )
    }

    if (requests.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
                <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800">
                    <Check className="text-neutral-700" size={32} />
                </div>
                <p className="font-bold text-sm uppercase tracking-widest">Nenhuma solicitação pendente</p>
            </div>
        )
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">
                    Solicitações Pendentes ({requests.length})
                </h3>
                <button onClick={fetchRequests} className="text-[10px] font-bold text-yellow-500 hover:text-yellow-400 uppercase">
                    Atualizar
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requests.map(req => (
                    <div key={req.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:border-yellow-500/30 transition-colors">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-yellow-500 font-black text-lg border border-neutral-700 relative">
                                    {req.full_name.charAt(0).toUpperCase()}
                                    {req.role_requested === 'teacher' && (
                                        <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-black p-0.5 rounded-full border border-black">
                                            <GraduationCap size={10} strokeWidth={3} />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-sm line-clamp-1 flex items-center gap-2">
                                        {req.full_name}
                                        {req.role_requested === 'teacher' && (
                                            <span className="text-[9px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider font-black">
                                                Professor
                                            </span>
                                        )}
                                    </h4>
                                    <div className="flex items-center gap-1 text-[10px] text-neutral-500">
                                        <Clock size={10} />
                                        <span>{new Date(req.created_at).toLocaleDateString()} às {new Date(req.created_at).toLocaleTimeString().slice(0,5)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {req.role_requested === 'teacher' && req.cref && (
                                <div className="flex items-center gap-2 text-xs text-yellow-200 bg-yellow-900/20 p-2 rounded-lg border border-yellow-500/20">
                                    <GraduationCap size={14} className="text-yellow-500" />
                                    <span className="font-mono font-bold">CREF: {req.cref}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/30 p-2 rounded-lg border border-white/5">
                                <Mail size={14} className="text-neutral-500" />
                                <span className="truncate select-all">{req.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/30 p-2 rounded-lg border border-white/5">
                                <Phone size={14} className="text-neutral-500" />
                                <span className="select-all">{req.phone || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/30 p-2 rounded-lg border border-white/5">
                                <Calendar size={14} className="text-neutral-500" />
                                <span>{req.birth_date ? new Date(req.birth_date).toLocaleDateString() : '-'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                            <button
                                onClick={() => handleAction(req, 'reject')}
                                disabled={processing === req.id}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-black uppercase transition-colors disabled:opacity-50"
                            >
                                {processing === req.id ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                                Recusar
                            </button>
                            <button
                                onClick={() => handleAction(req, 'accept')}
                                disabled={processing === req.id}
                                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 font-black text-xs uppercase transition-colors disabled:opacity-50"
                            >
                                {processing === req.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                                Aceitar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
