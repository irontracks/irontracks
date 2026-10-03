'use client'

import React from 'react'
import { useDialog } from '@/contexts/DialogContext'
import type { Medication } from '@/types/medications'

/**
 * Lista de remédios cadastrados.
 *
 * Excluir pergunta ANTES e o texto diz o que se perde: as tomadas de cada dose
 * caem em cascata no banco, e é a adesão que o professor lê. "Pausar" é a saída
 * para quem quer parar o lembrete sem perder o histórico — por isso ela está no
 * próprio texto da confirmação.
 */

const NOMES_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "Todos os dias" quando os 7; senão "Seg, Qua, Sex". */
export function rotuloDosDias(weekdays: number[]): string {
  const dias = Array.from(new Set(weekdays)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (dias.length === 7) return 'Todos os dias'
  return dias.map((d) => NOMES_CURTOS[d]).join(', ')
}

/** `YYYY-MM-DD` → `DD/MM/AAAA`, sem passar por `Date` (nada de fuso). */
function dataCurta(dateKey: string | null): string {
  if (!dateKey) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateKey
}

export const TEXTO_EXCLUIR =
  'Excluir este medicamento? O histórico de doses tomadas também será apagado. Se quiser guardar o histórico, use Pausar.'

type Props = {
  medications: Medication[]
  onEdit: (m: Medication) => void
  onToggleActive: (m: Medication) => void | Promise<unknown>
  /** Chamado SÓ depois da confirmação. */
  onDelete: (m: Medication) => void | Promise<unknown>
}

const BOTAO_SECUNDARIO =
  'min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-4 text-sm font-bold text-neutral-200 hover:text-white'

export default function MedicationList({ medications, onEdit, onToggleActive, onDelete }: Props) {
  const { confirm } = useDialog()

  const excluir = async (m: Medication) => {
    const sim = await confirm(TEXTO_EXCLUIR, 'Excluir medicamento', {
      destructive: true,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    })
    if (sim) await onDelete(m)
  }

  return (
    <ul className="space-y-3">
      {medications.map((m) => (
        <li key={m.id} className="rounded-2xl border border-neutral-800 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-base font-black text-white">{m.name}</p>
              {m.dose && <p className="text-sm text-neutral-300">{m.dose}</p>}
            </div>
            <span className="shrink-0 rounded-lg border border-neutral-700/50 px-2 py-1 text-xs font-bold text-neutral-300">
              {m.active ? 'Ativo' : 'Pausado'}
            </span>
          </div>

          <p className="mt-2 text-sm text-neutral-300">
            <span className="font-mono">{m.times.join(' · ')}</span>
          </p>
          <p className="text-xs text-neutral-400">{rotuloDosDias(m.weekdays)}</p>
          <p className="text-xs text-neutral-400">
            Desde {dataCurta(m.start_date)}
            {m.end_date ? ` · até ${dataCurta(m.end_date)}` : ''}
          </p>
          {m.notes && <p className="mt-1 break-words text-xs text-neutral-300">{m.notes}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onEdit(m)} aria-label={`Editar ${m.name}`} className={BOTAO_SECUNDARIO}>
              Editar
            </button>
            <button
              type="button"
              onClick={() => void onToggleActive(m)}
              aria-label={`${m.active ? 'Pausar' : 'Reativar'} ${m.name}`}
              className={BOTAO_SECUNDARIO}
            >
              {m.active ? 'Pausar' : 'Reativar'}
            </button>
            <button
              type="button"
              onClick={() => void excluir(m)}
              aria-label={`Excluir ${m.name}`}
              className={BOTAO_SECUNDARIO}
            >
              Excluir
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
