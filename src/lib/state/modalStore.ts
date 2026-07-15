/**
 * @module modalStore
 *
 * Store Zustand pra controle de modais globais do dashboard.
 * Substitui ~11 useStates que viviam em IronTracksAppClientImpl (REACT_AUDIT.md #20).
 *
 * Justificativa (vs Context ou useState local):
 * - 11 useStates no god component re-renderizavam toda a árvore a cada toggle.
 * - 11 Contexts seria pior — cada Provider re-renderiza consumers (vide finding #4).
 * - Zustand vive fora da árvore React: `useModalStore(s => s.wizardOpen)` só
 *   re-renderiza quando ESSE slice muda. Crítico em mobile WKWebView.
 *
 * Convenções:
 * - Cada modal: `{xxxOpen|xxxPayload, setXxxOpen|setXxxPayload}`.
 * - Refs/Promises (ex: preCheckinResolveRef) NÃO entram no store — vivem em
 *   React refs no hook que dispara o handshake.
 * - Modais retornados por hooks dedicados (useWhatsNew, useSeasonalCampaign,
 *   useActiveSession.editActive, useActiveSession.preCheckin) NÃO entram aqui —
 *   ficam no hook que possui a lógica.
 */
'use client'

import { create } from 'zustand'

interface ModalStoreState {
  // ─── Boolean toggles ────────────────────────────────────────────────────
  createWizardOpen: boolean
  setCreateWizardOpen: (v: boolean) => void

  expressWorkoutOpen: boolean
  setExpressWorkoutOpen: (v: boolean) => void

  standaloneCardioOpen: boolean
  setStandaloneCardioOpen: (v: boolean) => void

  nutritionOpen: boolean
  setNutritionOpen: (v: boolean) => void

  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

  coachPending: boolean
  setCoachPending: (v: boolean) => void

  showNotifCenter: boolean
  setShowNotifCenter: (v: boolean) => void

  showProgressPhotos: boolean
  setShowProgressPhotos: (v: boolean) => void

  // ─── Slices com payload ────────────────────────────────────────────────
  // Tipagem propositalmente unknown pra evitar deps cíclicas com tipos de domínio;
  // consumers fazem cast no ponto de uso.
  quickViewWorkout: unknown | null
  setQuickViewWorkout: (v: unknown | null) => void

  openStudent: Record<string, unknown> | null
  setOpenStudent: (v: Record<string, unknown> | null) => void
}

export const useModalStore = create<ModalStoreState>((set) => ({
  createWizardOpen: false,
  setCreateWizardOpen: (v) => set({ createWizardOpen: v }),

  expressWorkoutOpen: false,
  setExpressWorkoutOpen: (v) => set({ expressWorkoutOpen: v }),

  standaloneCardioOpen: false,
  setStandaloneCardioOpen: (v) => set({ standaloneCardioOpen: v }),

  nutritionOpen: false,
  setNutritionOpen: (v) => set({ nutritionOpen: v }),

  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  coachPending: false,
  setCoachPending: (v) => set({ coachPending: v }),

  showNotifCenter: false,
  setShowNotifCenter: (v) => set({ showNotifCenter: v }),

  showProgressPhotos: false,
  setShowProgressPhotos: (v) => set({ showProgressPhotos: v }),

  quickViewWorkout: null,
  setQuickViewWorkout: (v) => set({ quickViewWorkout: v }),

  openStudent: null,
  setOpenStudent: (v) => set({ openStudent: v }),
}))
