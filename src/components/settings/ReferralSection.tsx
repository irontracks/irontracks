'use client'
/**
 * ReferralSection — shows the user's referral code + share options
 * and a field to enter someone else's referral code.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Share2, Users, Gift, Loader2 } from 'lucide-react'

export default function ReferralSection() {
  const [code, setCode] = useState('')
  const [referralUrl, setReferralUrl] = useState('')
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Enter a code state
  const [inputCode, setInputCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [submitOk, setSubmitOk] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/referral')
      const json = await res.json()
      if (json.ok) {
        setCode(json.code)
        setReferralUrl(json.referralUrl)
        setCount(json.count)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleShare = async () => {
    try {
      await navigator.share({ title: 'IronTracks', text: 'Entre no IronTracks com meu convite!', url: referralUrl })
    } catch { /* ignore */ }
  }

  const handleSubmitCode = async () => {
    if (!inputCode.trim()) return
    setSubmitting(true)
    setSubmitMsg('')
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setSubmitMsg(`Você entrou pelo convite de ${json.referrerName}!`)
        setSubmitOk(true)
        setInputCode('')
      } else {
        setSubmitMsg(json.error === 'already_referred' ? 'Você já usou um código.' : 'Código inválido.')
        setSubmitOk(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="animate-pulse h-24 rounded-xl bg-white/5" />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gift size={16} className="text-yellow-500" />
        <h3 className="text-base font-bold text-white">Programa de Convites</h3>
      </div>

      {/* Stats */}
      <div
        className="rounded-2xl p-4 flex items-center gap-4"
        style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}
      >
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,179,8,0.15)' }}>
          <Users size={22} className="text-yellow-400" />
        </div>
        <div>
          <p className="text-2xl font-black text-white">{count}</p>
          <p className="text-xs text-white/40">{count === 1 ? 'amigo convidado' : 'amigos convidados'}</p>
        </div>
      </div>

      {/* Referral code display */}
      <div className="space-y-2">
        <p className="text-xs font-black text-white/40 uppercase tracking-widest">Seu código de convite</p>
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="font-black text-yellow-400 text-lg tracking-widest flex-1">{code}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copiar código"
            className="text-white/40 hover:text-white transition-colors"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Share button */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black text-black"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
        >
          <Share2 size={14} />
          Compartilhar
        </button>
      </div>

      {/* Enter someone else's code */}
      <div className="space-y-2 pt-2">
        <p className="text-xs font-black text-white/40 uppercase tracking-widest">Entrou por convite? Digite o código</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={e => setInputCode(e.target.value.toUpperCase().slice(0, 8))}
            aria-label="Código de convite"
            placeholder="XXXXXXXX"
            className="flex-1 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:ring-1 focus:ring-amber-500/50 tracking-widest font-bold"
            maxLength={8}
          />
          <button
            type="button"
            onClick={handleSubmitCode}
            disabled={submitting || !inputCode.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-black text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : 'OK'}
          </button>
        </div>
        {submitMsg && (
          <p className={`text-xs ${submitOk ? 'text-green-400' : 'text-red-400'}`}>{submitMsg}</p>
        )}
      </div>
    </div>
  )
}
