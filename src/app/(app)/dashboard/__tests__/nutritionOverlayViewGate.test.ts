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
 *
 * O contrapeso (bug de 14/07): com essas duas travas, clicar na aba NUTRIÇÃO
 * estando em Avaliações/Comunidade/VIP não fazia NADA — o call-site só chamava
 * `setNutritionOpen(true)` e a trava #2 fechava no mesmo tick. Abrir a nutrição
 * tem que NAVEGAR pro dashboard primeiro.
 */
const src = readFileSync(
  join(process.cwd(), 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'),
  'utf8',
)
const flat = src.replace(/\s+/g, ' ')

describe('NutritionOverlay — não vaza pra outras views', () => {
  it('só renderiza no dashboard (gate no view)', () => {
    expect(src).toContain("nutritionOpen && view === 'dashboard'")
  })

  it('fecha a nutrição ao navegar pra fora do dashboard', () => {
    expect(flat).toContain("if (view !== 'dashboard' && nutritionOpen) { setNutritionOpen(false)")
  })
})

describe('NutritionOverlay — abre a partir de QUALQUER aba', () => {
  it('nenhum call-site abre a nutrição sem navegar (o efeito fecharia no mesmo tick)', () => {
    expect(src).not.toContain('onOpenNutrition={() => setNutritionOpen(true)}')
    // os dois call-sites (aba Nutrição + atalho dentro do VipHub) usam o handler
    const uses = src.match(/onOpenNutrition=\{openNutrition\}/g) || []
    expect(uses.length).toBe(2)
  })

  it('o handler navega pro dashboard e só então abre', () => {
    expect(flat).toContain("if (view === 'dashboard') { setNutritionOpen(true); return }")
    expect(flat).toContain('pendingNutritionRef.current = true')
  })

  it('a intenção pendente é aplicada quando a navegação aterrissa', () => {
    // `view` é derivada do pathname e `setView` é router.push — a view só vira
    // 'dashboard' num render posterior, então a abertura tem que ser diferida.
    expect(flat).toContain("if (view !== 'dashboard' || !pendingNutritionRef.current) return")
  })

  it('trocar de aba desarma a intenção pendente', () => {
    expect(flat).toContain('pendingNutritionRef.current = false setNutritionOpen(false) setView(next)')
  })
})
