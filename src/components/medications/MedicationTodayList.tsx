'use client'

import React from 'react'
import { Check } from 'lucide-react'
import type { DoseDoDia } from '@/lib/medications/agenda'

/**
 * Doses de HOJE. "Tomei" é a ação primária da tela (dourado); depois de marcado a
 * linha vira "Tomado às 08:03" em verde — o verde existe SÓ para o estado tomado.
 *
 * Dose pendente ou atrasada NÃO ganha vermelho nem âmbar: o app não deve cobrar
 * quem trata a própria saúde, e atraso em remédio é decisão do médico, não da
 * cor da tela. A linha pendente é só a linha, com o botão.
 */

const HORA_BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** `HH:MM` em BRT de um instante ISO; vazio se o instante for inválido. */
export function horaBrt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return HORA_BRT.format(d)
}

type Props = {
  doses: DoseDoDia[]
  onTake: (medicationId: string, time: string) => void
  onUndo: (medicationId: string, time: string) => void
}

export default function MedicationTodayList({ doses, onTake, onUndo }: Props) {
  if (doses.length === 0) {
    return <p className="text-sm text-neutral-400">Nenhuma dose hoje.</p>
  }

  return (
    <ul className="space-y-2">
      {doses.map((d) => {
        const hora = horaBrt(d.takenAt)
        return (
          <li
            key={`${d.medicationId}|${d.time}`}
            className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-white/[0.02] p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                <span className="font-mono">{d.time}</span> · {d.nome}
                {d.dose ? ` · ${d.dose}` : ''}
              </p>
              {d.tomada && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {hora ? `Tomado às ${hora}` : 'Tomado'}
                </p>
              )}
            </div>
            {d.tomada ? (
              <button
                type="button"
                onClick={() => onUndo(d.medicationId, d.time)}
                aria-label={`Desfazer ${d.nome} das ${d.time}`}
                className="min-h-[44px] shrink-0 rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-4 text-sm font-bold text-neutral-200 hover:text-white"
              >
                Desfazer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onTake(d.medicationId, d.time)}
                aria-label={`Tomei ${d.nome} das ${d.time}`}
                className="min-h-[44px] shrink-0 rounded-xl bg-yellow-500 px-5 text-sm font-black text-black"
              >
                Tomei
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
