/**
 * Medicamentos no shell — a tela existe, mas só vale se alguém consegue ABRIR.
 *
 * Três pontas precisam estar ligadas, e cada uma passa verde sozinha com as
 * outras desligadas (defeito de CONTRATO, não de unidade):
 *
 *  1. o menu do avatar tem o item e chama `onOpenMedications` (comportamento);
 *  2. o shell abre a tela por DOIS caminhos — o item do menu e o evento
 *     `irontracks:push:navigate` com os tipos `medication_*` (o MESMO evento que o
 *     toque no push e o toque no card do sino disparam; ver `abrirDestino` em
 *     `NotificationCenter`);
 *  3. o `DashboardModals` renderiza a tela quando `medicationsOpen` é verdadeiro.
 *
 * A tela é um modal por ESTADO, de propósito: navegação de página inteira fora de
 * `/app` abre o Safari no iPhone — por isso nada aqui usa rota nem `window.location`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/contexts/DialogContext', () => ({
  useDialog: () => ({ alert: vi.fn(), confirm: vi.fn() }),
}))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: Record<string, unknown>) => <img alt={String(p.alt ?? '')} />,
}))

import HeaderActionsMenu from '@/components/HeaderActionsMenu'
import { useModalStore } from '@/lib/state/modalStore'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SHELL = 'src/app/app/(app)/dashboard/IronTracksAppClientImpl.tsx'
const MODAIS = 'src/app/app/(app)/dashboard/DashboardModals.tsx'
const HEADER = 'src/app/app/(app)/dashboard/DashboardHeader.tsx'

const abrirMenu = () => fireEvent.click(screen.getByLabelText('Menu'))

describe('menu do avatar — item Medicamentos (comportamento)', () => {
  it('mostra "Medicamentos" e chama onOpenMedications ao tocar', () => {
    const onOpenMedications = vi.fn()
    render(<HeaderActionsMenu user={{ displayName: 'Teste' }} onOpenMedications={onOpenMedications} />)
    abrirMenu()
    fireEvent.click(screen.getByText('Medicamentos'))
    expect(onOpenMedications).toHaveBeenCalledTimes(1)
    // tocar fecha o menu, como os itens vizinhos
    expect(screen.queryByText('Medicamentos')).toBeNull()
    cleanup()
  })

  it('sem a prop, o item não aparece (não promete uma tela que não abre)', () => {
    render(<HeaderActionsMenu user={{ displayName: 'Teste' }} />)
    abrirMenu()
    expect(screen.queryByText('Medicamentos')).toBeNull()
    cleanup()
  })

  it('fica logo depois de "Histórico de refeições" e sem dourado', () => {
    render(<HeaderActionsMenu user={{ displayName: 'Teste' }} onOpenNutritionHistory={() => {}} onOpenMedications={() => {}} />)
    abrirMenu()
    const refeicoes = screen.getByText('Histórico de refeições')
    const remedios = screen.getByText('Medicamentos')
    expect(refeicoes.compareDocumentPosition(remedios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const botao = remedios.closest('button')
    expect(botao?.className ?? '').not.toMatch(/yellow|gold/)
    cleanup()
  })
})

describe('modalStore — medicationsOpen', () => {
  it('abre e fecha pelo setter', () => {
    expect(useModalStore.getState().medicationsOpen).toBe(false)
    useModalStore.getState().setMedicationsOpen(true)
    expect(useModalStore.getState().medicationsOpen).toBe(true)
    useModalStore.getState().setMedicationsOpen(false)
    expect(useModalStore.getState().medicationsOpen).toBe(false)
  })
})

describe('shell — fiação das pontas', () => {
  const shell = semComentarios(ler(SHELL))
  const modais = semComentarios(ler(MODAIS))
  const header = semComentarios(ler(HEADER))

  it('o menu do avatar está ligado ao store pelo header', () => {
    expect(shell, 'o shell precisa passar onOpenMedications ao DashboardHeader').toMatch(
      /onOpenMedications=\{\(\)\s*=>\s*setMedicationsOpen\(true\)\}/,
    )
    expect(header, 'o DashboardHeader precisa repassar a prop ao menu').toMatch(
      /onOpenMedications=\{onOpenMedications\}/,
    )
  })

  it.each(['medication_reminder', 'medication_updated'])(
    'o handler de navegação trata %s abrindo a tela e retornando',
    (tipo) => {
      const i = shell.indexOf("addEventListener('irontracks:push:navigate'")
      const handler = shell.slice(shell.lastIndexOf('const onPushNavigate', i), i)
      expect(handler, `${tipo} cairia no fallback (sem link, o toque não faz nada)`).toContain(`'${tipo}'`)
      const ramo = handler.slice(handler.indexOf(`'${tipo}'`), handler.indexOf(`'${tipo}'`) + 160)
      expect(ramo).toMatch(/setMedicationsOpen\(true\)/)
      expect(ramo).toMatch(/return/)
    },
  )

  it('o ramo vem ANTES do fallback de link genérico', () => {
    expect(shell.indexOf("'medication_reminder'")).toBeGreaterThan(-1)
    expect(shell.indexOf("'medication_reminder'")).toBeLessThan(shell.indexOf("const link = String(detail?.link"))
  })

  it('o shell entrega medicationsOpen/setMedicationsOpen ao DashboardModals', () => {
    expect(shell).toMatch(/medicationsOpen=\{medicationsOpen\}/)
    expect(shell).toMatch(/setMedicationsOpen=\{setMedicationsOpen\}/)
  })

  it('o DashboardModals renderiza a tela quando medicationsOpen, e fecha pelo setter', () => {
    expect(modais).toMatch(
      /dynamic\(\(\)\s*=>\s*import\('@\/components\/medications\/MedicationsScreen'\),\s*\{\s*ssr:\s*false\s*\}\)/,
    )
    expect(modais).toMatch(
      /medicationsOpen\s*&&\s*\(\s*<MedicationsScreen\s+onClose=\{\(\)\s*=>\s*setMedicationsOpen\(false\)\}\s*\/>/,
    )
  })

  it('nada de rota nova nem window.location para abrir a tela (Safari no iPhone)', () => {
    for (const src of [shell, modais]) {
      expect(src).not.toMatch(/\/dashboard\/(medications|medicamentos)/)
    }
  })
})
