'use client'

import { useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

/**
 * FASE 0 de `docs/plans/voz-na-serie.md` — ver o comentário da rota
 * (`app/(app)/dashboard/voice-capture/page.tsx`). Ferramenta de calibração,
 * não de produto: dita uma frase, o transcript CRU (o que o reconhecedor
 * devolveu, sem nenhum parsing) fica na tela e vai para `user_activity_events`
 * como `voice_capture_sample`.
 *
 * Cada captura carrega um `path` próprio (`/_voice-capture/<n>`) para nunca
 * cair no dedupe de 1.200 ms do `trackUserEvent` — a chave é `${nome}::${path}`,
 * e frases ditadas em sequência rápida não podem se apagar uma à outra aqui:
 * cada amostra é o dado que se quer medir, não um evento de produto repetido.
 */
export default function VoiceCaptureDebug() {
  const [capturas, setCapturas] = useState<{ texto: string; hora: string }[]>([])

  const { gravando, parcial, erro, permissaoNegada, iniciar, parar } = useSpeechToText({
    onFinal: (texto) => {
      const n = capturas.length + 1
      trackUserEvent('voice_capture_sample', {
        type: 'debug',
        screen: 'voice_capture',
        path: `/_voice-capture/${n}`,
        metadata: { transcript: texto, n },
      })
      setCapturas((prev) => [{ texto, hora: new Date().toLocaleTimeString('pt-BR') }, ...prev])
    },
  })

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-black">Calibração de voz — só isto</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Toque, fale como diria peso/reps/RPE numa série de verdade (&ldquo;cem quilos, doze
            repetições, erre pê ê oito&rdquo;, &ldquo;oitenta e dois e meio, dez reps&rdquo;…) e
            confira o que apareceu. Cada frase vira uma amostra — não precisa acertar o formato,
            é isso que estamos medindo.
          </p>
        </div>

        <button
          type="button"
          onClick={gravando ? parar : iniciar}
          className={[
            'w-full h-14 rounded-xl font-black text-sm inline-flex items-center justify-center gap-2 transition-colors',
            gravando
              ? 'bg-red-500/15 border border-red-500/40 text-red-300'
              : 'bg-yellow-500 text-black',
          ].join(' ')}
        >
          {gravando ? <Square size={18} /> : <Mic size={18} />}
          {gravando ? 'Ouvindo… toque para parar' : 'Falar'}
        </button>

        {parcial && <p className="text-xs text-neutral-400 italic">&ldquo;{parcial}&rdquo;</p>}
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        {permissaoNegada && (
          <p className="text-xs text-amber-400">
            Permissão negada. Habilite microfone e reconhecimento de voz nas configurações do
            aparelho.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {capturas.length} amostra{capturas.length === 1 ? '' : 's'}
          </p>
          {capturas.map((c, i) => (
            <div key={i} className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2">
              <p className="text-[10px] text-neutral-400">{c.hora}</p>
              <p className="text-sm text-white">{c.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
