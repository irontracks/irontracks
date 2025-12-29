'use client'

import React, { useState } from 'react'

import { Plus, Dumbbell, Play, Share2, Copy, MoreVertical, Trash2 } from 'lucide-react'

export type DashboardWorkout = {
  id?: string
  user_id?: string | null
  created_by?: string | null
  title?: string
  notes?: string | null
  exercises?: any[]
}

type Props = {
  workouts: DashboardWorkout[]
  profileIncomplete: boolean
  onOpenCompleteProfile: () => void
  view: 'dashboard' | 'assessments'
  onChangeView: (next: 'dashboard' | 'assessments') => void
  onCreateWorkout: () => void
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => void
  onShareWorkout: (w: DashboardWorkout) => void
  onDuplicateWorkout: (w: DashboardWorkout) => void
  onEditWorkout: (w: DashboardWorkout) => void
  onDeleteWorkout: (id?: string, title?: string) => void
  currentUserId?: string
  exportingAll?: boolean
  onExportAll: () => void
  onOpenJsonImport: () => void
}

export default function StudentDashboard(props: Props) {
  const workouts = Array.isArray(props.workouts) ? props.workouts : []
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div className="p-4 space-y-4 pb-24">
      {props.profileIncomplete && (
        <div className="bg-neutral-800 border border-yellow-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Perfil incompleto</div>
            <div className="text-sm text-neutral-300 mt-1">Complete seu nome de exibição para personalizar sua conta.</div>
          </div>
          <button
            type="button"
            onClick={props.onOpenCompleteProfile}
            className="shrink-0 bg-yellow-500 text-black font-black px-4 py-2 rounded-xl active:scale-95 transition-transform"
          >
            Terminar cadastro
          </button>
        </div>
      )}

      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-1 flex gap-1">
        <button
          onClick={() => props.onChangeView('dashboard')}
          className={`flex-1 min-h-[44px] px-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors ${
            props.view === 'dashboard'
              ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
              : 'bg-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Treinos
        </button>
        <button
          onClick={() => props.onChangeView('assessments')}
          className={`flex-1 min-h-[44px] px-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors ${
            props.view === 'assessments'
              ? 'bg-neutral-900 text-yellow-500 border border-yellow-500/30'
              : 'bg-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Avaliações
        </button>
      </div>

      {props.view === 'dashboard' && (
        <>
          <button
            onClick={props.onCreateWorkout}
            className="w-full min-h-[44px] bg-yellow-500 p-4 rounded-xl font-black text-black flex items-center justify-center gap-2 shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-transform active:scale-95"
          >
            <Plus size={24} /> Novo Treino
          </button>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Meus Treinos</h3>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setToolsOpen((v) => !v)}
                  className="min-h-[44px] px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl font-bold text-xs uppercase hover:bg-neutral-700"
                  aria-expanded={toolsOpen}
                >
                  Ferramentas
                </button>
                {toolsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden text-neutral-300">
                      <div className="p-2 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setToolsOpen(false)
                            props.onOpenJsonImport()
                          }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm"
                        >
                          <span className="font-bold text-white">Importar JSON</span>
                          <span className="text-yellow-500">↵</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setToolsOpen(false)
                            props.onExportAll()
                          }}
                          disabled={!!props.exportingAll}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800 text-sm disabled:opacity-50"
                        >
                          <span className="text-neutral-200">Exportar JSON</span>
                          <span className="text-neutral-500">↓</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {workouts.length === 0 && (
              <div className="text-center py-10 text-neutral-600">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                  <Dumbbell size={32} />
                </div>
                <p>Nenhum treino criado.</p>
              </div>
            )}

            {workouts.map((w, idx) => (
              <div
                key={String(w?.id ?? idx)}
                className="bg-neutral-800 rounded-xl p-4 border-l-4 border-neutral-600 md:hover:border-yellow-500 transition-all group relative overflow-hidden cursor-pointer"
                onClick={() => props.onQuickView(w)}
              >
                <div className="relative z-10">
                  <h3 className="font-bold text-white text-lg uppercase mb-1 pr-32 leading-tight">{String(w?.title || 'Treino')}</h3>
                  <p className="text-xs text-neutral-400 font-mono mb-4">{Array.isArray(w?.exercises) ? w.exercises.length : 0} EXERCÍCIOS</p>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onStartSession(w)
                      }}
                      className="relative z-30 flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg flex items-center justify-center gap-2 text-white font-bold text-sm transition-colors border border-white/10 active:scale-95 touch-manipulation"
                    >
                      <Play size={16} className="fill-white" /> INICIAR TREINO
                    </button>
                  </div>
                </div>

                <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20 bg-neutral-900/50 backdrop-blur-sm rounded-lg p-1 border border-white/5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onShareWorkout(w)
                    }}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"
                  >
                    <Share2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onDuplicateWorkout(w)
                    }}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onEditWorkout(w)
                    }}
                    className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {w?.user_id && props.currentUserId && w.user_id === props.currentUserId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDeleteWorkout(w?.id, w?.title)
                      }}
                      className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
