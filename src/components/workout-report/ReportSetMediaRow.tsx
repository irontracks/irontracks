'use client'
import React from 'react'
import { SET_MEDIA_KIND_LABEL, setMediaStatusText, type SetMediaView } from '@/lib/workout/setMediaView'

/**
 * Linha do relatório (tela) com a foto/vídeo da série e a resposta da IA.
 * Mídia abre em nova aba pela URL assinada; a resposta fica visível sem
 * toque — é ela que o aluno veio ver depois da notificação.
 */
export function ReportSetMediaRow({ items, colSpan }: { items: SetMediaView[]; colSpan: number }) {
  return (
    <tr className="border-b border-neutral-800">
      <td className="pb-3 pt-1 align-top text-[10px] t-meta-inherit text-neutral-400">Mídia</td>
      <td className="pb-3 pt-1 text-xs text-neutral-200" colSpan={colSpan - 1}>
        <ul className="space-y-2">
          {items.map((m) => {
            const status = setMediaStatusText(m)
            const kind = SET_MEDIA_KIND_LABEL[m.kind === 'video' ? 'video' : 'photo']
            return (
              <li key={m.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 text-[11px] text-neutral-200 underline-offset-2 hover:underline"
                    >
                      {m.kind === 'video' ? '🎥' : '📷'} {kind}
                    </a>
                  ) : (
                    <span className="text-[11px] text-neutral-400">{m.kind === 'video' ? '🎥' : '📷'} {kind}</span>
                  )}
                  {status && <span className="text-[11px] text-neutral-400">{status}</span>}
                </div>
                {m.aiAnswer && (
                  <p className="text-xs leading-snug text-neutral-200">
                    <span className="font-semibold text-yellow-300">IA: </span>
                    {m.aiAnswer}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </td>
    </tr>
  )
}

export default ReportSetMediaRow
