import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: a overlay de Nutrição é local do dashboard (fixed/z-25, não é
 * rota). Ela NÃO pode renderizar em outras views nem ficar aberta ao navegar —
 * senão fica POR CIMA da view nova (bug: abrir Histórico pelo menu não abria, a
 * nutrição ficava sobreposta). Duas travas complementares:
 *   1. render gated por `view === 'dashboard'`;
 *   2. efeito que fecha a nutrição (setNutritionOpen(false)) ao sair do dashboard.
 */
const src = readFileSync(
  join(process.cwd(), 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'),
  'utf8',
)

describe('NutritionOverlay — não vaza pra outras views', () => {
  it('só renderiza no dashboard (gate no view)', () => {
    expect(src).toContain("nutritionOpen && view === 'dashboard'")
  })

  it('fecha a nutrição ao navegar pra fora do dashboard', () => {
    // normaliza espaços pra casar independente de indentação/quebra
    const flat = src.replace(/\s+/g, ' ')
    expect(flat).toContain("if (view !== 'dashboard' && nutritionOpen) { setNutritionOpen(false)")
  })
})
