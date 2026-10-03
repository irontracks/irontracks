'use client'

import React, { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { useMedications } from '@/hooks/useMedications'
import type { MedicationInput } from '@/schemas/medications'
import type { Medication } from '@/types/medications'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import MedicationForm from './MedicationForm'
import MedicationList from './MedicationList'
import MedicationTodayList from './MedicationTodayList'

/**
 * Tela cheia de medicamentos do aluno (abre pelo menu do avatar).
 *
 * Janela de verdade: `role="dialog"` + foco preso + Esc/X fecham. O formulário é
 * uma sub-tela DENTRO dela (não outro modal por cima), para o foco e o Voltar
 * nativo terem um dono só.
 *
 * O aviso médico fica sempre à vista: a tela organiza lembretes e NÃO orienta
 * tratamento — quem decide dose e horário é o médico.
 */

type Formulario = { tipo: 'novo' } | { tipo: 'editar'; medicamento: Medication }

/** Há outra janela (ex.: o confirmar de excluir) por cima desta? */
const temOutraJanelaPorCima = (): boolean =>
  typeof document !== 'undefined' && document.querySelectorAll('[role="dialog"]').length > 1

export default function MedicationsScreen({ onClose }: { onClose: () => void }) {
  const med = useMedications()
  const [formulario, setFormulario] = useState<Formulario | null>(null)

  // Esc / Voltar: fecha o formulário primeiro; só depois a tela.
  const voltar = useCallback(() => {
    if (temOutraJanelaPorCima()) return
    if (formulario) {
      setFormulario(null)
      return
    }
    onClose()
  }, [formulario, onClose])

  const focusTrapRef = useFocusTrap(true, voltar)
  useBackHandler(true, voltar)

  const enviar = useCallback(
    (input: MedicationInput): Promise<boolean> =>
      formulario?.tipo === 'editar' ? med.update(formulario.medicamento.id, input) : med.create(input),
    [formulario, med],
  )

  const vazio = !med.loading && med.medications.length === 0
  const mostrarErro = Boolean(med.error) && !formulario

  return (
    <div className="fixed inset-0 z-[1300] bg-black/90 backdrop-blur-xl" {...backdropProps(voltar)}>
      <div
        ref={focusTrapRef}
        {...dialogProps('Medicamentos')}
        className="mx-auto flex h-full w-full max-w-lg flex-col bg-neutral-950"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-4 pb-3 pt-safe">
          <h2 className="pt-3 text-lg font-black text-white">
            {formulario
              ? formulario.tipo === 'novo'
                ? 'Novo medicamento'
                : 'Editar medicamento'
              : 'Medicamentos'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="tap-44 mt-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-white/[0.04] text-neutral-300 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-safe">
          <p className="text-xs text-neutral-400">
            Lembrete de organização. Não substitui a orientação do seu médico.
          </p>
          {med.hasCoach && (
            <p className="mt-1 text-xs text-neutral-400">Seu professor pode ver e editar esta lista.</p>
          )}

          {mostrarErro && (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-bold text-red-400">{med.error}</p>
              {med.medications.length === 0 && (
                <button
                  type="button"
                  onClick={() => void med.reload()}
                  className="min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-4 text-sm font-bold text-neutral-200 hover:text-white"
                >
                  Tentar de novo
                </button>
              )}
            </div>
          )}

          {formulario ? (
            <div className="mt-5">
              <MedicationForm
                // Remonta ao trocar de remédio: o estado interno nasce do `initial`.
                key={formulario.tipo === 'editar' ? formulario.medicamento.id : 'novo'}
                initial={formulario.tipo === 'editar' ? formulario.medicamento : undefined}
                onSubmit={enviar}
                onSaved={() => setFormulario(null)}
                onCancel={() => setFormulario(null)}
              />
            </div>
          ) : med.loading ? (
            <p className="mt-5 text-sm text-neutral-400">Carregando…</p>
          ) : vazio ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <p className="text-sm text-neutral-300">Nenhum medicamento cadastrado.</p>
              <button
                type="button"
                onClick={() => setFormulario({ tipo: 'novo' })}
                className="min-h-[44px] rounded-xl bg-yellow-500 px-5 text-sm font-black text-black"
              >
                Adicionar
              </button>
            </div>
          ) : (
            <>
              <section className="mt-6" aria-labelledby="med-hoje">
                <h3 id="med-hoje" className="mb-2 text-sm font-black text-white">Hoje</h3>
                <MedicationTodayList
                  doses={med.doses}
                  onTake={(id, time) => void med.markTaken(id, time)}
                  onUndo={(id, time) => void med.undoTaken(id, time)}
                />
              </section>

              <section className="mt-8" aria-labelledby="med-lista">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 id="med-lista" className="text-sm font-black text-white">Seus medicamentos</h3>
                  <button
                    type="button"
                    onClick={() => setFormulario({ tipo: 'novo' })}
                    className="min-h-[44px] rounded-xl border border-neutral-700/50 bg-neutral-800/60 px-4 text-sm font-bold text-neutral-200 hover:text-white"
                  >
                    Adicionar
                  </button>
                </div>
                <MedicationList
                  medications={med.medications}
                  onEdit={(m) => setFormulario({ tipo: 'editar', medicamento: m })}
                  onToggleActive={(m) => med.update(m.id, { active: !m.active })}
                  onDelete={(m) => med.remove(m.id)}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
