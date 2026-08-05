import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StoryGroup } from '@/types/social'

/**
 * Três correções no visualizador de stories (05/08/2026):
 *
 *   1. o contador de espectadores mostrava 0 até o autor ABRIR a lista — o número
 *      saía do array carregado sob demanda, não da listagem;
 *   2. o autor conseguia curtir o próprio story (a barra de emoji já ficava
 *      escondida para ele, o coração não);
 *   3. puxar para baixo fecha, como no Instagram.
 *
 * O gesto é exercitado por eventos de ponteiro reais. O que jsdom NÃO prova é o
 * desenho: `paintDrag` escreve `style.transform` direto no nó, e aqui isso é
 * apenas uma string — a suavidade do arrasto é conferência visual.
 */

vi.mock('@/contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: async () => false, alert: async () => undefined }),
}))
vi.mock('@/lib/logger', () => ({ logError: () => undefined, logWarn: () => undefined }))
vi.mock('@/lib/api', () => ({
  apiSocial: {
    markStoryViewed: vi.fn(async () => ({ ok: true })),
    viewStory: vi.fn(async () => ({ ok: true })),
    getStoryComments: vi.fn(async () => ({ ok: true, data: [] })),
    getStoryViews: vi.fn(async () => ({ ok: true, data: [{ viewerId: 'v1', displayName: 'Ana' }] })),
    likeStory: vi.fn(async () => ({ ok: true })),
    addStoryComment: vi.fn(async () => ({ ok: true, data: {} })),
    deleteStory: vi.fn(async () => ({ ok: true })),
  },
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', { alt: String(props.alt ?? '') }),
}))

import StoryViewer from '../StoryViewer'

const ME = 'me-1'

const grupo = (over: Partial<StoryGroup['stories'][number]> = {}, authorId = ME): StoryGroup => ({
  authorId,
  displayName: 'Eu',
  photoUrl: null,
  role: null,
  stories: [{
    id: 's1',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    caption: null,
    mediaUrl: 'https://cdn.example.com/foto.jpg',
    mediaKind: 'image',
    viewed: false,
    viewCount: 27,
    likeCount: 4,
    hasLiked: false,
    commentCount: 0,
    ...over,
  }],
})

const props = {
  myId: ME,
  onClose: vi.fn(),
  onStoryUpdated: vi.fn(),
  onStoryDeleted: vi.fn(),
}

beforeEach(() => {
  props.onClose.mockClear()
})

describe('1. o contador de espectadores não espera a lista abrir', () => {
  it('mostra o número que veio da listagem', () => {
    render(<StoryViewer group={grupo()} {...props} />)
    expect(screen.getByText('27')).toBeTruthy()
  })

  it('sem `viewCount` cai em 0 — story antigo, cache velho, não pode quebrar', () => {
    // Os outros contadores ficam diferentes de 0 só para não confundir a busca.
    render(<StoryViewer group={grupo({ viewCount: undefined, likeCount: 4, commentCount: 9 })} {...props} />)
    expect(screen.getByText('0')).toBeTruthy()
  })
})

describe('2. o autor não curte o próprio story', () => {
  it('no story dele o coração é placar, não botão', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    // Botões da tela: fechar, deletar, navegação, olho, comentários — nenhum de curtir.
    const label = container.querySelector('[aria-label="4 curtidas"]')
    expect(label).toBeTruthy()
    expect(label?.tagName).not.toBe('BUTTON')
  })

  it('no story de outra pessoa continua clicável', () => {
    const { container } = render(
      <StoryViewer group={grupo({}, 'outra-pessoa')} {...props} myId={ME} />,
    )
    expect(container.querySelector('[aria-label="4 curtidas"]')).toBeNull()
  })
})

describe('3. puxar para baixo fecha', () => {
  /** O card é o container do gesto. */
  const card = (c: HTMLElement) => c.querySelector('.max-w-md') as HTMLElement

  const arrastar = (el: HTMLElement, dy: number, dx = 0) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 200 })
    fireEvent.pointerMove(el, { clientX: 100 + dx, clientY: 200 + dy })
    fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 200 + dy })
  }

  it('arrastar bastante para baixo fecha', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    arrastar(card(container), 160)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('um puxão curto NÃO fecha — senão o toque comum viraria saída', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    arrastar(card(container), 30)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('arrastar para CIMA não fecha', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    arrastar(card(container), -160)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('movimento predominantemente LATERAL não fecha — é navegação entre stories', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    arrastar(card(container), 60, 200)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('o gesto que nasce na folha de comentários/espectadores é rolagem, não saída', () => {
    const { container } = render(<StoryViewer group={grupo()} {...props} />)
    const c = card(container)
    // Simula o pointerdown vindo de dentro da folha.
    const folha = document.createElement('div')
    folha.setAttribute('data-story-sheet', '')
    c.appendChild(folha)
    fireEvent.pointerDown(folha, { clientX: 100, clientY: 200 })
    fireEvent.pointerMove(folha, { clientX: 100, clientY: 400 })
    fireEvent.pointerUp(folha, { clientX: 100, clientY: 400 })
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
