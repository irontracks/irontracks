'use client'

/**
 * Folha do chat de nutrição.
 *
 * Portal pro document.body de propósito: a folha vive dentro do NutritionMixer,
 * que é renderizado tanto na página quanto DENTRO do overlay da aba — e o overlay
 * é um `fixed` com z-index, o que cria contexto de empilhamento e prenderia a
 * folha atrás dele. (Mesma armadilha do modal de check-out do treino.)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, Send, Sparkles, X } from 'lucide-react'
import { applyChatSimulationAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'
import NutritionSimulationCard, { type Simulation } from './NutritionSimulationCard'
import type { SnapshotGoals } from '@/lib/nutrition/chatContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  sim?: Simulation | null
  /** Alimentos sugeridos, tocáveis: viram uma pergunta "se eu comer X". */
  suggestions?: string[]
  /** Erro de rede/servidor — some no reenvio, não polui a conversa como resposta. */
  failed?: boolean
}

const SUGGESTIONS = [
  'Se eu comer 5 ovos cozidos agora, pra quanto vai?',
  'Quanto falta de proteína hoje?',
  'O que eu como pra fechar a meta?',
]

/** Turnos mandados ao servidor. 6 é o teto do Zod da rota. */
const HISTORY_TURNS = 6

/**
 * Negrito de `**assim**` — o único markdown que aparece aqui (o narrador
 * determinístico destaca os números, e o Gemini também usa). Sem isto o usuário lê
 * "**388 kcal**" com os asteriscos crus na tela.
 *
 * Monta nós React em vez de innerHTML: o texto vem do modelo, e nada que veio do
 * modelo vira HTML neste app.
 */
function RichText({ text }: { text: string }) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}

export default function NutritionChat({
  open,
  onClose,
  dateKey,
  goals,
  onLogged,
}: {
  open: boolean
  onClose: () => void
  dateKey: string
  goals: SnapshotGoals
  onLogged: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set())
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  // Esc fecha — teclado é o caminho de quem usa no desktop.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim()
      if (!question || sending) return

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: question }
      // Histórico ANTES de acrescentar o turno atual (a rota recebe a pergunta à parte).
      const history = [...messages]
        .filter((m) => !m.failed)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text }))

      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setSending(true)

      try {
        const res = await fetch('/api/ai/nutrition-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, dateKey, goals, history }),
        })
        const body = await res.json().catch(() => null)

        if (res.status === 403 && body?.upgradeRequired) {
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'assistant', text: 'O chat de nutrição é do plano Pro. Dá uma olhada na aba VIP pra liberar.', failed: true },
          ])
          return
        }
        if (!res.ok || !body?.ok) {
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'assistant', text: res.status === 429 ? 'Calma aí, muitas perguntas seguidas. Tenta de novo em instantes.' : 'Não consegui responder agora. Tenta de novo.', failed: true },
          ])
          return
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: String(body.reply || ''),
            sim: body.sim ?? null,
            suggestions: Array.isArray(body.suggestions) ? body.suggestions.slice(0, 3) : [],
          },
        ])
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: getErrorMessage(e) ? 'Sem conexão agora. Tenta de novo.' : 'Não consegui responder agora.', failed: true },
        ])
      } finally {
        setSending(false)
      }
    },
    [messages, sending, dateKey, goals],
  )

  const logSim = useCallback(
    async (msgId: string, sim: Simulation) => {
      setLoggingId(msgId)
      try {
        const res = await applyChatSimulationAction(
          { foodText: sim.foodText, items: sim.items },
          dateKey,
          `chat-${msgId}`, // idempotente: toque duplo não duplica o lançamento
        )
        if (res?.ok) {
          setLoggedIds((prev) => new Set(prev).add(msgId))
          onLogged()
        }
      } finally {
        setLoggingId(null)
      }
    },
    [dateKey, onLogged],
  )

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex flex-col bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Chat de nutrição">
      <button type="button" className="flex-1" aria-label="Fechar" onClick={onClose} />

      {/* max-w no desktop: a folha é um padrão de mobile, e esticada em 1400px de
          largura a conversa vira uma linha só atravessando a tela. */}
      <div className="mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl border-t border-white/10 bg-neutral-950 pb-safe">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-yellow-500" />
            <div>
              <div className="text-sm font-black text-white">Perguntar sobre a dieta</div>
              <div className="text-[11px] text-neutral-500">Simulo antes de você comer</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-[180px] flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Exemplos:</div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-left text-xs text-neutral-300 transition hover:border-yellow-500/30 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-yellow-500/15 px-3 py-2 text-sm text-white">{m.text}</div>
              ) : (
                <div className="max-w-[92%]">
                  <div className={`whitespace-pre-wrap text-sm leading-relaxed ${m.failed ? 'text-neutral-500' : 'text-neutral-200'}`}>
                    <RichText text={m.text} />
                  </div>
                  {m.sim && (
                    <NutritionSimulationCard
                      sim={m.sim}
                      canLog
                      logging={loggingId === m.id}
                      logged={loggedIds.has(m.id)}
                      onLog={() => logSim(m.id, m.sim as Simulation)}
                    />
                  )}

                  {/* Sugestões tocáveis. Tocar NÃO lança: manda "se eu comer X",
                      que cai no atalho determinístico e devolve o card com o
                      impacto exato. O usuário vê o número ANTES de decidir —
                      sugestão → simulação → lançamento, sem atalho cego. */}
                  {!!m.suggestions?.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={sending}
                          onClick={() => send(`se eu comer ${s}`)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/25 bg-yellow-500/[0.06] px-3 py-1.5 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/15 disabled:opacity-40"
                        >
                          <Plus size={12} />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" /> Calculando…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-white/[0.06] p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Se eu comer 5 ovos agora…"
            aria-label="Sua pergunta"
            className="min-h-[44px] flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[16px] text-white outline-none transition placeholder:text-neutral-500 focus:border-yellow-500/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Enviar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-500 text-black transition hover:bg-yellow-400 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
