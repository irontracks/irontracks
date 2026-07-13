import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: os modais de histórico (Editar / Adicionar) precisam ficar
 * ANCORADOS NO TOPO (items-start) em coluna flex com altura capada — NÃO
 * centralizados. Centralizado (items-center) + teclado do iOS (Capacitor
 * resize 'native' encolhe o WebView) recentraliza a cada frame e o modal entra
 * num loop de subir/descer sem deixar o usuário tocar em nada. Ver os dois
 * componentes. Se alguém voltar pra items-center, este teste falha.
 */
const MODALS = ['HistoryListEditModal.tsx', 'HistoryListManualModal.tsx']

describe('Modais de histórico — âncora anti-loop do teclado (iOS)', () => {
  for (const file of MODALS) {
    const src = readFileSync(join(process.cwd(), 'src/components', file), 'utf8')

    it(`${file}: overlay ancora no topo (items-start), não centraliza`, () => {
      expect(src).toContain('items-start justify-center')
      expect(src).not.toContain('items-center justify-center p-4')
    })

    it(`${file}: dialog usa coluna flex com altura capada estável (sem dvh)`, () => {
      expect(src).toContain('flex flex-col')
      expect(src).toContain('max-h-full')
      // dvh oscila com o teclado no iOS — não pode voltar.
      expect(src).not.toContain('100dvh')
    })

    it(`${file}: miolo rola em flex-1 (não max-h-[70vh])`, () => {
      expect(src).toContain('flex-1 min-h-0 overflow-y-auto')
      expect(src).not.toContain('max-h-[70vh]')
    })

    it(`${file}: trava o scroll do body (anti-jitter do teclado iOS)`, () => {
      expect(src).toContain('useBodyScrollLock(true)')
    })
  }
})
