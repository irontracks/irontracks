import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

/**
 * Badge de não-lidas do chat da dupla: REMONTAR não é "chegou mensagem".
 *
 * Terceiro caso da mesma classe achada em 10/09/2026 (os outros dois:
 * `wizard_abandoned` no mount e a tela saltando ao retomar treino) — **baseline
 * que nasce vazia faz o estado preexistente parecer novo.**
 *
 * Aqui o detalhe que fecha o diagnóstico: `chatMessages` SOBREVIVE ao desmonte
 * deste componente. Ele mora no `useTeamBroadcast`, cujo provider vive no shell
 * do dashboard — acima do `ActiveWorkout`, que é quem monta e desmonta o
 * drawer. Então sair do treino e voltar, numa dupla que já conversou, reacendia
 * o badge com TODAS as mensagens já lidas.
 */

// ⚠️ Referência NOVA a cada mudança: o efeito depende de [chatMessages, open]
// e o React compara por identidade. Mutar o mesmo array não re-dispara nada —
// o harness mediria um cenário que não existe.
let mensagens: Array<Record<string, unknown>> = []
const teamCtx = {
  get chatMessages() { return mensagens },
  sendChatMessage: vi.fn(),
  teamSession: { id: 't1' },
  participants: [],
}
vi.mock('@/contexts/TeamWorkoutContext', () => ({
  useTeamWorkout: () => teamCtx,
}))
vi.mock('../workout/WorkoutContext', () => ({
  useWorkoutContext: () => ({ session: null }),
}))
vi.mock('@/contexts/team/types', () => ({
  normalizeParticipant: (p: Record<string, unknown>) => p,
}))
vi.mock('next/image', () => ({ default: () => null }))

import { TeamChatDrawer } from '../TeamChatDrawer'

const props = { myUserId: 'u1', myDisplayName: 'Eu', myPhotoURL: null, participants: [] }

const badge = (c: HTMLElement) => c.textContent?.match(/\d+/)?.[0] ?? null

beforeEach(() => { mensagens = [] })
afterEach(() => cleanup())

describe('o badge de não-lidas não conta o que já estava lá', () => {
  it('montar com conversa preexistente não acende o badge', () => {
    // A dupla conversou, o usuário saiu do treino e voltou: o drawer remonta
    // com a lista cheia, e ninguém mandou nada agora.
    mensagens = [{ id: 'm1', text: 'bora' }, { id: 'm2', text: 'vamo' }, { id: 'm3', text: '!' }]

    const { container } = render(<TeamChatDrawer {...props} />)

    expect(
      badge(container),
      'o badge reacendeu com mensagens já lidas — é o defeito da remontagem',
    ).toBeNull()
  })

  it('mensagem que chega DEPOIS, com o drawer fechado, conta', () => {
    // O comportamento que o badge existe para produzir não pode sumir junto.
    mensagens = [{ id: 'm1', text: 'bora' }]
    const { container, rerender } = render(<TeamChatDrawer {...props} />)
    expect(badge(container)).toBeNull()

    mensagens = [...mensagens, { id: 'm2', text: 'chegou agora' }]
    rerender(<TeamChatDrawer {...props} />)

    expect(badge(container), 'mensagem nova deixou de contar').toBe('1')
  })
})
