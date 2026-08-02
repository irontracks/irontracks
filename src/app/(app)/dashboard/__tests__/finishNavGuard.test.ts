import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressão: ao FINALIZAR um treino, o handleFinishSession limpa o activeSession na
 * hora e navega pro relatório com `setView` = router.push (ASSÍNCRONO). Até a rota
 * commitar, `view` ainda é 'active' e activeSession já é null.
 *
 * O guard `isSessionRestoring` existe pro caso do iOS matar o WebView (URL em
 * /dashboard/active, JS reiniciado sem sessão). Sem distinguir os dois casos, ele
 * confundia a janela de navegação do finish com "restaurando":
 *   → LoadingScreen aparecia
 *   → o cap de 5s disparava setView('dashboard') (usuário jogado de volta)
 *   → com o LoadingScreen seguindo montado, aos 8s vinha "Não foi possível carregar
 *     o app" (o fallback de travamento do LoadingScreen).
 * Intermitente: só quando a rota do relatório demorava a commitar.
 */
const impl = readFileSync(
  join(process.cwd(), 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'),
  'utf8',
)
const crud = readFileSync(join(process.cwd(), 'src/hooks/useWorkoutCrud.ts'), 'utf8')
const flat = impl.replace(/\s+/g, ' ')

describe('janela pós-finish não pode virar "restaurando sessão"', () => {
  it('o finish carimba o instante (justFinishedAtRef)', () => {
    expect(crud).toContain('justFinishedAtRef')
    expect(crud.replace(/\s+/g, ' ')).toContain('if (justFinishedAtRef) justFinishedAtRef.current = Date.now()')
  })

  it('o guard isSessionRestoring ignora a janela pós-finish', () => {
    // Sem o !isFinishNavPending(), o LoadingScreen aparece na navegação pro relatório.
    expect(flat).toContain("const isSessionRestoring = view === 'active' && !activeSession && !sessionRestoringExpired && !isFinishNavPending()")
  })

  it('o cap de 5s NÃO sequestra a navegação pro relatório', () => {
    // O cap faz setView('dashboard') — era ele que jogava o usuário de volta.
    expect(flat).toContain('if (isFinishNavPending()) return')
  })

  it('a janela é generosa mas finita (o cap volta a valer se a navegação travar)', () => {
    expect(impl).toContain('FINISH_NAV_GRACE_MS')
    expect(flat).toMatch(/Date\.now\(\) - justFinishedAtRef\.current < FINISH_NAV_GRACE_MS/)
  })
})
