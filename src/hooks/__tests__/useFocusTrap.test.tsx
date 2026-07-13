import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { useFocusTrap } from '../useFocusTrap'

// Harness: modal com 2 inputs usando useFocusTrap. O botão externo força um
// re-render do "pai" passando um onClose NOVO (arrow inline) a cada clique —
// reproduzindo exatamente como HistoryList passa onClose={() => ...}.
function Harness() {
  const [, setTick] = useState(0)
  // onClose recriado a cada render (referência instável de propósito)
  const ref = useFocusTrap(true, () => setTick((t) => t))
  return (
    <div>
      <button type="button" onClick={() => setTick((t) => t + 1)}>rerender</button>
      <div ref={ref}>
        <input aria-label="titulo" defaultValue="" />
        <input aria-label="duracao" defaultValue="" />
      </div>
    </div>
  )
}

const flushRaf = async () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })

describe('useFocusTrap — não rouba foco em re-render (bug do campo pulando)', () => {
  it('auto-foca o primeiro campo só ao abrir', async () => {
    render(<Harness />)
    await flushRaf()
    expect(document.activeElement).toBe(screen.getByLabelText('titulo'))
  })

  it('re-render com onClose novo NÃO devolve o foco pro primeiro campo', async () => {
    render(<Harness />)
    await flushRaf()

    // Usuário foca o segundo campo (Duração) e digita
    const duracao = screen.getByLabelText('duracao') as HTMLInputElement
    duracao.focus()
    expect(document.activeElement).toBe(duracao)

    // Pai re-renderiza (cada tecla fazia isso) — onClose vira referência nova
    fireEvent.click(screen.getByText('rerender'))
    await flushRaf()

    // O foco DEVE permanecer em Duração (antes pulava pra Título)
    expect(document.activeElement).toBe(duracao)
  })
})
