'use client'

import { useState } from 'react'
import { Activity, Camera, ChevronDown, Images, User, X } from 'lucide-react'

// Menu de ações fica RECOLHIDO por padrão (pedido do dono, jul/2026): a tela de
// avaliações abre limpa, mostrando primeiro os números. Toque no título expande.

type AssessmentHeaderProps = {
  onCreate: () => void
  onShowHistory: () => void
  onClose?: () => void
  /**
   * Quando definido, exibe um botão "+ Bioimpedância" pra registrar
   * standalone o resultado da máquina externa (farmácia/clínica). O
   * botão fica oculto se não for fornecido — útil pra contextos onde
   * só faz sentido a avaliação completa.
   */
  onAddBia?: () => void
  /**
   * Quando definido, exibe o botão "Por Foto" que abre a avaliação por
   * foto com laudo de IA (composição corporal via Gemini Vision).
   */
  onPhotoAssessment?: () => void
  /**
   * Quando definido, exibe o botão "Laudos" que abre o histórico das
   * avaliações por foto já geradas (o laudo fica salvo no banco).
   */
  onPhotoHistory?: () => void
  /**
   * Nasce expandido.
   *
   * O menu é um acordeão FECHADO por padrão, e no estado vazio isso deixava a
   * tela num beco: o card dizia "Nenhuma avaliação encontrada" enquanto o botão
   * "+ Nova Avaliação" ficava escondido atrás de um título que não parece
   * clicável. Quem nunca fez uma avaliação — exatamente quem vê essa tela — não
   * tinha como fazer a primeira. Visto no simulador em 09/08/2026.
   */
  defaultOpen?: boolean
}

export const AssessmentHeader = ({
  onCreate,
  onShowHistory,
  onClose,
  onAddBia,
  onPhotoAssessment,
  onPhotoHistory,
  defaultOpen = false,
}: AssessmentHeaderProps) => {
  // Layout: nº de colunas = nº de botões (Nova + Histórico são fixos).
  const count = 2 + (onAddBia ? 1 : 0) + (onPhotoAssessment ? 1 : 0) + (onPhotoHistory ? 1 : 0)
  const cols = count >= 5 ? 'sm:grid-cols-5' : count === 4 ? 'sm:grid-cols-4' : count === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  const [open, setOpen] = useState(defaultOpen)
  const toggleOpen = () => setOpen((v) => !v)
  return (
    <div
      className="rounded-2xl border p-6 mb-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(20,18,10,0.9) 0%, rgba(12,12,12,0.95) 40%)',
        borderColor: 'rgba(234,179,8,0.15)',
        boxShadow: '0 8px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(234,179,8,0.1)',
      }}
    >
      {/* Gold shimmer top line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={open ? 'Recolher menu de avaliações' : 'Expandir menu de avaliações'}
          className="flex items-center text-left min-w-0 w-full sm:w-auto"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 shrink-0"
            style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}
          >
            <User className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-white">Avaliações Físicas</h1>
            <p className="text-neutral-400 text-sm">Gerencie as avaliações e acompanhe a evolução</p>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-neutral-400 shrink-0 ml-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <div className={`${open ? 'grid' : 'hidden'} grid-cols-1 ${cols} gap-2 flex-1 sm:flex-none`}>
            <button
              onClick={onCreate}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl text-black font-black shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30 transition-all duration-300 active:scale-95 btn-gold-animated"
            >
              + Nova Avaliação
            </button>
            {onAddBia ? (
              <button
                onClick={onAddBia}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl border font-bold transition-all duration-300 active:scale-95 inline-flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  borderColor: 'rgba(59,130,246,0.30)',
                  color: '#93c5fd',
                }}
                title="Registrar resultado da bioimpedância (PDF da farmácia/clínica)"
              >
                <Activity className="w-4 h-4" />
                Bioimpedância
              </button>
            ) : null}
            {onPhotoAssessment ? (
              <button
                onClick={onPhotoAssessment}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl border font-bold transition-all duration-300 active:scale-95 inline-flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(168,85,247,0.08)',
                  borderColor: 'rgba(168,85,247,0.30)',
                  color: '#d8b4fe',
                }}
                title="Avaliação por foto com laudo de IA (composição corporal)"
              >
                <Camera className="w-4 h-4" />
                Por Foto
              </button>
            ) : null}
            {onPhotoHistory ? (
              <button
                onClick={onPhotoHistory}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl border font-bold transition-all duration-300 active:scale-95 inline-flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(168,85,247,0.05)',
                  borderColor: 'rgba(168,85,247,0.22)',
                  color: '#c4b5fd',
                }}
                title="Ver os laudos por foto já gerados"
              >
                <Images className="w-4 h-4" />
                Laudos
              </button>
            ) : null}
            <button
              onClick={onShowHistory}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl border text-neutral-200 font-bold hover:text-yellow-400 hover:border-yellow-500/40 transition-all duration-300 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              Ver Histórico
            </button>
          </div>
          {/* Dizia "Fechar" e fazia `history.back()` — duas coisas diferentes.
              O rótulo agora nomeia a ação real, e existe `aria-label`: em botão
              só de ícone, `title` não é lido de forma confiável por leitor de
              tela, então quem usa VoiceOver ouvia "botão" e mais nada.

              `self-start` tira o X do centro da pilha de cinco botões, onde ele
              ficava na altura do "Por Foto" e, por proximidade, parecia
              pertencer a ele. No topo, lê como controle do CARD — que é o que
              de fato é. */}
          {!onClose ? (
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="shrink-0 self-start w-11 h-11 rounded-xl border text-neutral-400 hover:text-white hover:border-yellow-500/40 transition-all duration-300 active:scale-95 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
              title="Voltar"
              aria-label="Voltar"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
