'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  ImagePlus,
  Loader2,
  MessageCircleQuestion,
  Send,
  Video,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { dialogProps, backdropProps } from '@/utils/a11y/backdrop'
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'
import { REST_BAR_INSET } from './helpers/restBarInset'
import {
  LIMITE_DA_PERGUNTA,
  TETO_DE_MIDIA_BYTES,
  chaveDaDecisao,
  chaveDoRascunho,
  perguntaValida,
  precisaPerguntarAoSair,
  recadoDoErro,
  tipoDaMidia,
  type MensagemDoChat,
  type TipoDeMidia,
} from '@/lib/workout/exerciseChatThread'

/* ──────────────────────────────────────────────────────────────────────────
 * Conversa de IA sobre UM exercício, durante o treino.
 *
 * ## O que não pode se perder, e por quê
 *
 * 1. **A conversa.** Cada mensagem é gravada pela rota no instante do envio, e
 *    o modal recarrega a thread por GET ao abrir. Fechar sem querer não apaga
 *    nada — nem o X, nem o Escape, nem o toque fora.
 * 2. **A pergunta digitada.** Ela existe em UM lugar só enquanto não sai da
 *    tela, então (a) o rascunho é gravado a cada tecla no `localStorage`, com
 *    o endereço da thread na chave, e (b) falha de rede DEVOLVE o texto ao
 *    campo em vez de engolir. É o precedente do campo de observação da
 *    refeição: `onSalvar` devolve `false` e o editor não colapsa.
 *
 * ## Cores
 *
 * A RESPOSTA da IA veste violeta — é saída de máquina, e é exatamente para
 * isso que a cor existe (`lib/design/machineAccent`). Os controles que o
 * usuário aciona, não: o "Enviar" é a ação primária do modal e leva o dourado;
 * o resto é neutro.
 * ────────────────────────────────────────────────────────────────────────── */

interface ExerciseChatModalProps {
  /** `session.startedAt` em ISO — só existe para o DONO da sessão. */
  endereco: string
  exIdx: number
  exerciseName: string
  onFechar: () => void
}

type MensagemNaTela = MensagemDoChat & { pendente?: boolean }

const BUCKET_PADRAO = 'set-media'

const lerLocal = (chave: string): string => {
  try {
    return typeof window === 'undefined' ? '' : String(window.localStorage.getItem(chave) ?? '')
  } catch {
    return ''
  }
}

const gravarLocal = (chave: string, valor: string): void => {
  try {
    if (typeof window === 'undefined') return
    if (valor) window.localStorage.setItem(chave, valor)
    else window.localStorage.removeItem(chave)
  } catch {
    /* modo privado / storage cheio: o rascunho é conveniência, não dado */
  }
}

export default function ExerciseChatModal({
  endereco,
  exIdx,
  exerciseName,
  onFechar,
}: ExerciseChatModalProps) {
  const [supabase] = useState(() => createClient())
  const chaveRascunho = chaveDoRascunho(endereco, exIdx)
  const chaveDecisao = chaveDaDecisao(endereco, exIdx)

  // `carregando` nasce true (e não vira true dentro de um efeito): setState
  // síncrono em useEffect é render em cascata, e o ESLint deste repo reprova.
  const [carregando, setCarregando] = useState(true)
  const [erroAoCarregar, setErroAoCarregar] = useState('')
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>([])
  const [nomeAnterior, setNomeAnterior] = useState<string | null>(null)

  const [texto, setTexto] = useState(() => lerLocal(chaveRascunho))
  const [midia, setMidia] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const [decididoEm, setDecididoEm] = useState(() => Number(lerLocal(chaveDecisao)) || 0)
  const [saindo, setSaindo] = useState(false)
  const [resumindo, setResumindo] = useState(false)
  const [erroDoResumo, setErroDoResumo] = useState('')

  const arquivoRef = useRef<HTMLInputElement>(null)
  const fimDaListaRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  // ── Sair: a decisão sobre o relatório vem ANTES de fechar ─────────────────
  const pedirParaSair = useCallback(() => {
    if (enviando) return
    if (precisaPerguntarAoSair(mensagens.length, decididoEm)) {
      setSaindo(true)
      return
    }
    onFechar()
  }, [enviando, mensagens.length, decididoEm, onFechar])

  const focusTrapRef = useFocusTrap(true, pedirParaSair)

  // ── Carga da thread ──────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    const buscar = async () => {
      try {
        const qs = new URLSearchParams({
          sessionStartedAt: endereco,
          exerciseIndex: String(exIdx),
          exerciseName,
        })
        const res = await fetch(`/api/ai/exercise-chat?${qs.toString()}`, {
          credentials: 'include',
        })
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; messages?: MensagemDoChat[]; nomeAnterior?: string | null; error?: string }
          | null
        if (!vivo) return
        if (!res.ok || !json?.ok) {
          setErroAoCarregar(recadoDoErro(json?.error))
          setCarregando(false)
          return
        }
        setMensagens(Array.isArray(json.messages) ? json.messages : [])
        setNomeAnterior(json.nomeAnterior ? String(json.nomeAnterior) : null)
        setCarregando(false)
      } catch {
        if (!vivo) return
        // Thread vazia por falha de rede NÃO é thread vazia: dizer isso evita
        // que o usuário pergunte de novo algo que ele já perguntou.
        setErroAoCarregar('Não consegui carregar a conversa. Você pode escrever mesmo assim.')
        setCarregando(false)
      }
    }
    void buscar()
    return () => {
      vivo = false
    }
  }, [endereco, exIdx, exerciseName])

  // Rolagem para a última mensagem. Efeito que mexe no DOM, não no estado.
  useEffect(() => {
    try {
      fimDaListaRef.current?.scrollIntoView({ block: 'nearest' })
    } catch {
      /* jsdom e WebViews antigos não têm scrollIntoView */
    }
  }, [mensagens.length, carregando])

  // ── Anexo ────────────────────────────────────────────────────────────────
  const escolherArquivo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    if (!tipoDaMidia(file.type)) {
      setErro('Só dá para anexar foto ou vídeo.')
      return
    }
    if (file.size > TETO_DE_MIDIA_BYTES) {
      setErro('Arquivo grande demais (o limite é 60 MB).')
      return
    }
    setErro('')
    setMidia(file)
  }, [])

  /** Sobe o anexo e devolve o que a rota precisa saber sobre ele. */
  const subirMidia = useCallback(
    async (file: File): Promise<{ path: string; kind: TipoDeMidia; mime: string }> => {
      const kind = tipoDaMidia(file.type)
      if (!kind) throw new Error('tipo_invalido')

      const res = await fetch('/api/ai/exercise-chat/prepare-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mime: file.type, size: file.size }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; path?: string; token?: string; bucket?: string; error?: string }
        | null
      // `fetch` só rejeita em falha de REDE: 403/409/500 resolvem normalmente.
      if (!res.ok || !json?.ok || !json.path || !json.token) {
        throw new Error(String(json?.error || 'upload_falhou'))
      }

      const envio = await supabase.storage
        .from(String(json.bucket || BUCKET_PADRAO))
        .uploadToSignedUrl(json.path, json.token, file, {
          contentType: file.type,
          upsert: true,
        })
      if (envio?.error) throw new Error('upload_falhou')

      return { path: json.path, kind, mime: file.type }
    },
    [supabase],
  )

  // ── Enviar ───────────────────────────────────────────────────────────────
  const enviar = useCallback(async () => {
    if (enviando) return
    const pergunta = texto.trim()
    if (!perguntaValida(pergunta)) {
      setErro(
        pergunta.length > LIMITE_DA_PERGUNTA
          ? `Pergunta longa demais (máximo de ${LIMITE_DA_PERGUNTA} caracteres).`
          : 'Escreva a sua dúvida antes de enviar.',
      )
      return
    }

    const anexo = midia
    setErro('')
    setEnviando(true)
    // O campo esvazia para a pergunta virar balão — mas o RASCUNHO salvo só é
    // apagado depois do 200. Se algo falhar no meio, o texto volta inteiro.
    setTexto('')
    setMensagens((prev) => [
      ...prev,
      {
        role: 'user',
        content: pergunta,
        mediaKind: anexo ? tipoDaMidia(anexo.type) : null,
        createdAt: new Date().toISOString(),
        pendente: true,
      },
    ])

    const desfazer = (recado: string) => {
      setMensagens((prev) => prev.filter((m) => !m.pendente))
      setTexto(pergunta)
      setMidia(anexo)
      setErro(recado)
      setEnviando(false)
      try {
        campoRef.current?.focus()
      } catch {
        /* foco é conforto, não requisito */
      }
    }

    let media: { path: string; kind: TipoDeMidia; mime: string } | null = null
    if (anexo) {
      try {
        media = await subirMidia(anexo)
      } catch {
        desfazer('Não consegui enviar o anexo. Sua pergunta continua aqui.')
        return
      }
    }

    try {
      const res = await fetch('/api/ai/exercise-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionStartedAt: endereco,
          exerciseIndex: exIdx,
          exerciseName,
          question: pergunta,
          ...(media ? { media: { path: media.path, kind: media.kind, mime: media.mime } } : {}),
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; answer?: string; error?: string }
        | null
      if (!res.ok || !json?.ok || !json.answer) {
        desfazer(recadoDoErro(json?.error))
        return
      }

      const agora = new Date().toISOString()
      setMensagens((prev) => [
        ...prev.map((m) => (m.pendente ? { ...m, pendente: false } : m)),
        { role: 'assistant', content: String(json.answer), mediaKind: null, createdAt: agora },
      ])
      setMidia(null)
      setEnviando(false)
      gravarLocal(chaveRascunho, '')
    } catch {
      desfazer('Sem conexão agora. Sua pergunta continua aqui — tente de novo.')
    }
  }, [enviando, texto, midia, subirMidia, endereco, exIdx, exerciseName, chaveRascunho])

  // ── Decisão sobre o relatório ────────────────────────────────────────────
  const registrarDecisao = useCallback(
    (total: number) => {
      setDecididoEm(total)
      gravarLocal(chaveDecisao, String(total))
    },
    [chaveDecisao],
  )

  const recusarResumo = useCallback(() => {
    registrarDecisao(mensagens.length)
    onFechar()
  }, [registrarDecisao, mensagens.length, onFechar])

  const aceitarResumo = useCallback(async () => {
    if (resumindo) return
    setResumindo(true)
    setErroDoResumo('')
    try {
      const res = await fetch('/api/ai/exercise-chat/summary', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionStartedAt: endereco, exerciseIndex: exIdx, exerciseName }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; summary?: string; error?: string }
        | null
      if (!res.ok || !json?.ok) {
        // Não fecha: fechar aqui deixaria o usuário achando que incluiu.
        setErroDoResumo(recadoDoErro(json?.error))
        setResumindo(false)
        return
      }
      registrarDecisao(mensagens.length)
      setResumindo(false)
      onFechar()
    } catch {
      setErroDoResumo('Sem conexão para gerar o resumo agora. Tente de novo ou saia sem incluir.')
      setResumindo(false)
    }
  }, [resumindo, endereco, exIdx, exerciseName, registrarDecisao, mensagens.length, onFechar])

  const podeEnviar = !enviando && perguntaValida(texto)

  const conteudo = (
    <div
      /* A faixa do rodapé é da BARRA DO DESCANSO. Sem devolvê-la, esta folha
         cobre o cronômetro e o START — e z-index não resolve: quem estiver por
         cima esconde o outro. Ver helpers/restBarInset. */
      style={REST_BAR_INSET}
      className="fixed inset-0 z-[2400] flex items-end justify-center bg-black/80 backdrop-blur-sm"
      {...backdropProps(pedirParaSair, 'Sair da conversa')}
    >
      <div
        ref={focusTrapRef}
        {...dialogProps(`Dúvida sobre ${exerciseName}`)}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-neutral-800 bg-neutral-950"
        // `100%` além dos 88vh: com o descanso na tela o contêiner já está
        // encurtado, e uma altura só em vh transbordaria por baixo dele.
        style={{ maxHeight: 'min(88vh, 100%)' }}
      >
        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageCircleQuestion size={18} className="flex-shrink-0 text-neutral-300" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold leading-tight text-white">Tirar dúvida</h2>
              <p className="truncate text-[11px] text-neutral-400">{exerciseName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={pedirParaSair}
            className="tap-44 inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-xs font-bold text-neutral-300 transition-colors hover:bg-neutral-800 active:scale-95"
            aria-label="Sair da conversa"
          >
            <X size={14} aria-hidden="true" />
            Sair
          </button>
        </div>

        {/* ── O exercício mudou de nome ─────────────────────────────────── */}
        {nomeAnterior ? (
          <div className="flex flex-shrink-0 items-start gap-2 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" aria-hidden="true" />
            <p className="text-[11px] leading-snug text-amber-200/90">
              Este exercício era <span className="font-bold">{nomeAnterior}</span> quando a conversa
              começou. O que está abaixo foi perguntado sobre ele.
            </p>
          </div>
        ) : null}

        {/* ── Mensagens ─────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-neutral-400">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span className="text-xs font-bold">Carregando a conversa…</span>
            </div>
          ) : null}

          {erroAoCarregar && !carregando ? (
            <p className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-[12px] leading-snug text-neutral-300">
              {erroAoCarregar}
            </p>
          ) : null}

          {!carregando && !erroAoCarregar && mensagens.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[13px] leading-relaxed text-neutral-300">
                Pergunte o que quiser sobre este exercício — pegada, postura, respiração, se a
                carga faz sentido.
              </p>
              <p className="mt-1.5 text-[11px] text-neutral-400">
                Pode anexar uma foto do aparelho ou um vídeo da sua execução.
              </p>
            </div>
          ) : null}

          {mensagens.map((m, i) => (
            <div
              key={`${m.createdAt}-${i}`}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl border px-3 py-2',
                  m.role === 'user'
                    ? 'border-neutral-700/60 bg-neutral-800/60'
                    : MACHINE_ACCENT.surface,
                  m.pendente ? 'opacity-60' : '',
                ].join(' ')}
              >
                {m.role === 'assistant' ? (
                  <div className={`t-meta-inherit mb-1 text-[10px] ${MACHINE_ACCENT.text}`}>
                    Resposta da IA
                  </div>
                ) : null}
                {m.mediaKind ? (
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-neutral-300">
                    {m.mediaKind === 'video' ? (
                      <Video size={12} aria-hidden="true" />
                    ) : (
                      <ImagePlus size={12} aria-hidden="true" />
                    )}
                    {m.mediaKind === 'video' ? 'Vídeo anexado' : 'Foto anexada'}
                  </div>
                ) : null}
                <p
                  className={[
                    'whitespace-pre-wrap text-[13px] leading-relaxed',
                    m.role === 'user' ? 'text-neutral-100' : MACHINE_ACCENT.textOnSurface,
                  ].join(' ')}
                >
                  {m.content}
                </p>
              </div>
            </div>
          ))}

          {enviando ? (
            <div className="flex items-center gap-2 text-neutral-400">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              <span className="text-[11px] font-bold">A IA está respondendo…</span>
            </div>
          ) : null}

          <div ref={fimDaListaRef} />
        </div>

        {/* ── Sair: a conversa entra no relatório? ──────────────────────── */}
        {saindo ? (
          <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/60 px-4 py-3">
            <div className="flex items-start gap-2">
              <FileText size={15} className="mt-0.5 flex-shrink-0 text-neutral-300" aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="text-[13px] font-bold leading-tight text-white">
                  As informações deste chat entram no relatório?
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-neutral-400">
                  Um resumo do que você perguntou e do que a IA respondeu fica no relatório deste
                  treino. A conversa continua salva de qualquer forma.
                </p>
              </div>
            </div>

            {erroDoResumo ? (
              <p className="mt-2 text-[11px] leading-snug text-red-300">{erroDoResumo}</p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={aceitarResumo}
                disabled={resumindo}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-500 text-sm font-bold text-black transition-colors active:scale-95 disabled:opacity-60"
              >
                {resumindo ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                Sim, incluir
              </button>
              <button
                type="button"
                onClick={recusarResumo}
                disabled={resumindo}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 text-sm font-bold text-neutral-200 transition-colors active:scale-95 disabled:opacity-60"
              >
                Não incluir
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSaindo(false)
                setErroDoResumo('')
              }}
              className="tap-44 mt-2 inline-flex h-9 items-center text-[11px] font-bold text-neutral-300 active:scale-95"
            >
              Voltar à conversa
            </button>
          </div>
        ) : (
          /* ── Escrever ────────────────────────────────────────────────── */
          <div className="flex-shrink-0 border-t border-neutral-800 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
            {erro ? (
              <p className="mb-2 text-[11px] leading-snug text-red-300">{erro}</p>
            ) : null}

            {midia ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/50 px-2.5 py-1.5">
                {tipoDaMidia(midia.type) === 'video' ? (
                  <Video size={13} className="flex-shrink-0 text-neutral-300" aria-hidden="true" />
                ) : (
                  <ImagePlus size={13} className="flex-shrink-0 text-neutral-300" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">
                  {midia.name || (tipoDaMidia(midia.type) === 'video' ? 'Vídeo' : 'Foto')}
                </span>
                <button
                  type="button"
                  onClick={() => setMidia(null)}
                  className="tap-44 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-neutral-300 active:scale-95"
                  aria-label="Remover o anexo"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*,video/*"
                onChange={escolherArquivo}
                className="hidden"
                tabIndex={-1}
                aria-label="Escolher foto ou vídeo"
              />
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={enviando}
                className="tap-44 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
                aria-label="Anexar foto ou vídeo"
              >
                <ImagePlus size={17} aria-hidden="true" />
              </button>

              <textarea
                ref={campoRef}
                value={texto}
                onChange={(e) => {
                  const v = e.target.value.slice(0, LIMITE_DA_PERGUNTA)
                  setTexto(v)
                  gravarLocal(chaveRascunho, v)
                }}
                rows={2}
                maxLength={LIMITE_DA_PERGUNTA}
                placeholder="Qual é a sua dúvida?"
                disabled={enviando}
                className="min-h-[44px] w-full flex-1 resize-none rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-3 py-2.5 text-[13px] leading-snug text-white placeholder:text-neutral-400 focus:border-neutral-600 focus:outline-none disabled:opacity-60"
                aria-label="Sua dúvida sobre o exercício"
              />

              <button
                type="button"
                onClick={enviar}
                disabled={!podeEnviar}
                className={[
                  'tap-44 inline-flex h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors active:scale-95',
                  podeEnviar
                    ? 'bg-yellow-500 text-black'
                    : 'border border-neutral-800 bg-neutral-900 text-neutral-400',
                ].join(' ')}
                aria-label="Enviar a pergunta"
              >
                {enviando ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={15} aria-hidden="true" />
                )}
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return conteudo
}
