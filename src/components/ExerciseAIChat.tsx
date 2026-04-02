'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Send, X, ChevronDown, Loader2, Zap } from 'lucide-react'

export interface ExerciseChatContext {
  exerciseName: string
  muscleGroup?: string
  method?: string
  setsPlanned?: number
  setsDone?: number
  repsPlanned?: string
  weight?: string
  notes?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ExerciseAIChatProps {
  context: ExerciseChatContext
}

const QUICK_PROMPTS = [
  'Como executo corretamente?',
  'Estou sentindo dor. O que pode ser?',
  'Posso substituir por outro exercício?',
  'Dica para sentir mais o músculo',
]

let msgIdCounter = 0
function newId() { return `msg-${Date.now()}-${++msgIdCounter}` }

export function ExerciseAIChat({ context }: ExerciseAIChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Ensure we're client-side (needed for createPortal)
  useEffect(() => { setMounted(true) }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  // Opening greeting
  const handleOpen = () => {
    setOpen(true)
    if (messages.length === 0) {
      setMessages([{
        id: newId(),
        role: 'assistant',
        content: `Olá! Sou seu coach de IA para o exercício **${context.exerciseName}**. Pode perguntar sobre execução, músculos, variações ou qualquer dúvida! 💪`,
      }])
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { id: newId(), role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const history = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai/exercise-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...context,
          messages: history,
        }),
      })

      const json = await res.json().catch(() => ({ ok: false, error: 'Erro de rede' }))
      if (!json.ok || !json.content) {
        const errMsg = json.error === 'rate_limited'
          ? 'Muitas perguntas seguidas. Aguarde um momento.'
          : json.error === 'limit_reached'
            ? 'Limite de mensagens atingido. Faça upgrade para continuar.'
            : (json.error ?? 'Erro ao processar resposta')
        setError(errMsg)
        return
      }

      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: json.content }])
    } catch {
      setError('Sem conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [context, messages, loading])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <>
      {/* ── AI button — shown inline, opens drawer ── */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpen() }}
        className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-all active:scale-95 flex-shrink-0"
        title="Coach IA — tire dúvidas sobre este exercício"
        aria-label="Abrir chat com IA sobre este exercício"
      >
        <Sparkles size={14} />
      </button>

      {/* ── Drawer rendered via portal to document.body — avoids event bubbling to ExerciseCard ── */}
      {mounted && open && createPortal(
        <div
          role="presentation"
          className="fixed inset-0 z-[80] flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Sheet — stopPropagation so backdrop click doesn't close when clicking inside */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Coach IA"
            className="relative w-full max-h-[80vh] flex flex-col rounded-t-3xl bg-neutral-950 border-t border-l border-r border-neutral-800 shadow-2xl overflow-hidden"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-neutral-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/80">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center shrink-0">
                  <Sparkles size={13} className="text-yellow-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-white leading-tight">Coach IA</p>
                  <p className="text-[10px] text-yellow-500/60 truncate font-medium">{context.exerciseName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <ChevronDown size={15} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px]">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2 items-end ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center shrink-0 mb-0.5">
                      <Zap size={10} className="text-yellow-400" />
                    </div>
                  )}
                  <div className={[
                    'max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-yellow-500 text-black rounded-br-sm font-medium'
                      : 'bg-neutral-800 text-neutral-100 rounded-bl-sm border border-neutral-700/60',
                  ].join(' ')}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 items-end">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0">
                    <Zap size={10} className="text-yellow-400" />
                  </div>
                  <div className="bg-neutral-800 border border-neutral-700/60 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
                    <Loader2 size={12} className="text-violet-400 animate-spin" />
                    <span className="text-[11px] text-neutral-400">Pensando…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  <X size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-300">{error}</p>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 1 && !loading && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 hover:bg-yellow-500/20 transition-colors active:scale-95"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-950">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte algo sobre este exercício…"
                aria-label="Mensagem para o Coach IA"
                maxLength={300}
                disabled={loading}
                autoComplete="off"
                className="flex-1 bg-neutral-800 text-white text-xs rounded-xl px-3 py-2.5 outline-none placeholder:text-neutral-500 border border-neutral-700 focus:border-yellow-500/40 transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-yellow-500 text-black flex items-center justify-center disabled:opacity-30 hover:bg-yellow-400 transition-all active:scale-95"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
