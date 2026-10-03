'use client'

import React, { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  MAX_HORARIOS_POR_MEDICAMENTO,
  MedicationInputSchema,
  type MedicationInput,
} from '@/schemas/medications'
import type { Medication } from '@/types/medications'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { plainFieldProps, properNameFieldProps } from '@/utils/ui/textFieldProps'

/**
 * Formulário de medicamento — COMPARTILHADO com o painel do professor.
 *
 * Por isso não conhece o hook nem a API: recebe `onSubmit` e devolve a decisão a
 * quem o monta. Contrato que não pode cair: **se `onSubmit` devolver `false`, o
 * formulário NÃO fecha e mantém o que foi digitado** — o remédio recém-descrito,
 * com horários e dias, não existe em nenhum outro lugar, e perdê-lo numa falha de
 * rede obrigaria a digitar tudo de novo.
 */

type Props = {
  initial?: Medication
  /** Devolve `true` se gravou. `false` = falhou: o formulário fica aberto. */
  onSubmit: (input: MedicationInput) => Promise<boolean>
  onCancel: () => void
  /**
   * Chamado SÓ depois de `onSubmit` devolver `true`. Opcional: quem fecha o
   * formulário dentro do próprio `onSubmit` não precisa dele.
   */
  onSaved?: () => void
}

const DIAS = [
  { valor: 0, letra: 'D', nome: 'Domingo' },
  { valor: 1, letra: 'S', nome: 'Segunda-feira' },
  { valor: 2, letra: 'T', nome: 'Terça-feira' },
  { valor: 3, letra: 'Q', nome: 'Quarta-feira' },
  { valor: 4, letra: 'Q', nome: 'Quinta-feira' },
  { valor: 5, letra: 'S', nome: 'Sexta-feira' },
  { valor: 6, letra: 'S', nome: 'Sábado' },
] as const

const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]

const CAMPO =
  'w-full min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-3 text-sm text-white placeholder:text-neutral-400 focus:border-yellow-500/50 focus:outline-none'

const ROTULO = 'block text-xs font-bold text-neutral-400 mb-1.5'

export default function MedicationForm({ initial, onSubmit, onCancel, onSaved }: Props) {
  const uid = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [dose, setDose] = useState(initial?.dose ?? '')
  const [times, setTimes] = useState<string[]>(initial?.times?.length ? [...initial.times] : ['08:00'])
  const [weekdays, setWeekdays] = useState<number[]>(
    initial?.weekdays?.length ? [...initial.weekdays] : [...TODOS_OS_DIAS],
  )
  const [startDate, setStartDate] = useState(initial?.start_date ?? brtDateKey())
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [showNotes, setShowNotes] = useState(Boolean(initial?.notes))
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const alternarDia = (dia: number) => {
    if (!weekdays.includes(dia)) {
      setErro(null)
      setWeekdays([...weekdays, dia].sort((a, b) => a - b))
      return
    }
    // Remédio sem nenhum dia nunca vale — o último marcado não desmarca.
    if (weekdays.length === 1) {
      setErro('Mantenha ao menos um dia marcado.')
      return
    }
    setErro(null)
    setWeekdays(weekdays.filter((d) => d !== dia))
  }

  const trocarHorario = (i: number, valor: string) => {
    setErro(null)
    setTimes((atual) => atual.map((t, idx) => (idx === i ? valor : t)))
  }

  const removerHorario = (i: number) => {
    setErro(null)
    setTimes((atual) => (atual.length <= 1 ? atual : atual.filter((_, idx) => idx !== i)))
  }

  const adicionarHorario = () => {
    setErro(null)
    setTimes((atual) => (atual.length >= MAX_HORARIOS_POR_MEDICAMENTO ? atual : [...atual, '']))
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const lido = MedicationInputSchema.safeParse({
      name,
      dose,
      times,
      weekdays,
      startDate,
      endDate: endDate || null,
      notes,
      active: initial?.active ?? true,
    })
    if (!lido.success) {
      setErro(lido.error.issues[0]?.message ?? 'Confira os dados.')
      return
    }
    setErro(null)
    setSaving(true)
    let gravou = false
    try {
      gravou = await onSubmit(lido.data)
    } catch {
      gravou = false
    }
    setSaving(false)
    if (gravou) {
      onSaved?.()
      return
    }
    // Fica aberto, com tudo o que foi digitado.
    setErro('Não foi possível salvar. Seus dados continuam aqui — tente de novo.')
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5" aria-label={initial ? 'Editar medicamento' : 'Novo medicamento'}>
      <div>
        <label htmlFor={`${uid}-nome`} className={ROTULO}>Nome</label>
        <input
          id={`${uid}-nome`}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErro(null) }}
          maxLength={80}
          placeholder="ex.: Losartana"
          className={CAMPO}
          {...properNameFieldProps}
        />
      </div>

      <div>
        <label htmlFor={`${uid}-dose`} className={ROTULO}>Dose</label>
        <input
          id={`${uid}-dose`}
          type="text"
          value={dose}
          onChange={(e) => { setDose(e.target.value); setErro(null) }}
          maxLength={60}
          placeholder="ex.: 50 mg, 1 comprimido"
          className={CAMPO}
          {...plainFieldProps}
        />
      </div>

      <fieldset>
        <legend className={ROTULO}>Horários</legend>
        <ul className="space-y-2">
          {times.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={t}
                onChange={(e) => trocarHorario(i, e.target.value)}
                aria-label={`Horário ${i + 1}`}
                className={CAMPO}
              />
              {times.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerHorario(i)}
                  aria-label={`Remover horário ${i + 1}`}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-neutral-700/50 bg-neutral-800/60 text-neutral-300 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {times.length < MAX_HORARIOS_POR_MEDICAMENTO && (
          <button
            type="button"
            onClick={adicionarHorario}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-neutral-300 hover:text-white"
          >
            + horário
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className={ROTULO}>Dias da semana</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => {
            const marcado = weekdays.includes(d.valor)
            return (
              <button
                key={d.valor}
                type="button"
                aria-pressed={marcado}
                aria-label={d.nome}
                onClick={() => alternarDia(d.valor)}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-sm font-black transition-colors ${
                  marcado
                    ? 'border-white bg-white text-black'
                    : 'border-neutral-700/50 bg-neutral-800/60 text-neutral-300 hover:text-white'
                }`}
              >
                {d.letra}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-inicio`} className={ROTULO}>Início</label>
          <input
            id={`${uid}-inicio`}
            aria-label="Início"
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setErro(null) }}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-fim`} className={ROTULO}>Fim (opcional)</label>
          <input
            id={`${uid}-fim`}
            aria-label="Fim (opcional)"
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setErro(null) }}
            className={CAMPO}
          />
        </div>
      </div>

      {showNotes ? (
        <div>
          <label htmlFor={`${uid}-obs`} className={ROTULO}>Observação</label>
          <textarea
            id={`${uid}-obs`}
            aria-label="Observação"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setErro(null) }}
            maxLength={300}
            rows={3}
            placeholder="ex.: tomar em jejum"
            className="w-full rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-3 py-2.5 text-sm text-white placeholder:text-neutral-400 focus:border-yellow-500/50 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={showNotes}
          onClick={() => setShowNotes(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-1 text-sm font-bold text-neutral-300 hover:text-white"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar observação
        </button>
      )}

      {erro && (
        <p role="alert" className="text-sm font-bold text-red-400">
          {erro}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-5 text-sm font-bold text-neutral-200 hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] rounded-xl bg-yellow-500 px-6 text-sm font-black text-black disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
