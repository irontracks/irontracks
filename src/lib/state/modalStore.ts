/**
 * @module modalStore
 *
 * Store Zustand pra controle de modais globais do dashboard.
 *
 * Substitui ~20 useStates que viviam em IronTracksAppClientImpl.tsx, conforme
 * refactor planejado no REACT_AUDIT.md finding #20. Justificativa:
 *
 * - 20 useStates no god component re-renderizavam toda a árvore a cada toggle.
 * - 20 Contexts seria pior (cada Provider re-renderiza consumers — vide finding #4).
 * - Zustand vive fora da árvore React: `useModalStore(s => s.wizardOpen)` só
 *   re-renderiza quando ESSE slice muda. Crítico em mobile WKWebView.
 *
 * Padrão: cada modal é um slice com `{open: bool, payload?: T}` + `set/close`.
 * Refs (ex: `preCheckinResolveRef` pra Promise-handshake) vivem fora do store
 * — store guarda só estado serializável.
 *
 * Skeleton vazio nesta fase (PR#0). Slices serão adicionados em PR#2.
 */
'use client'

import { create } from 'zustand'

interface ModalStoreState {
  // ─── Slices virão em PR#2. Pra cada modal:
  //   xxxOpen: boolean
  //   openXxx: (payload?: T) => void
  //   closeXxx: () => void
  //
  // Slice list planejada:
  //   - createWizard, expressWorkout, standaloneCardio, nutrition
  //   - quickViewWorkout, settings, offlineSync, progressPhotos
  //   - notifCenter, preCheckin, whatsNew, mothersDay
  //   - import, jsonImport, export, share
  //   - openStudent, coachPending, completeProfile, editActive
  //
  // Por enquanto, store fica vazio (importado mas sem consumers) pra validar
  // setup de Zustand + tree-shaking + tipos.
  _placeholder?: never
}

export const useModalStore = create<ModalStoreState>(() => ({}))
