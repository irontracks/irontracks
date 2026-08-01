import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard do caminho de atualização do app.
 *
 * O QUE ACONTECEU (ago/2026): uma sessão inteira de correções foi testada
 * contra código VELHO. O servidor tinha o deploy certo — o `sw.js` publicado
 * trazia o hash do commit novo — mas o aparelho seguia com o bundle anterior,
 * porque:
 *
 *   1. a primeira checagem de versão só rodava 15 min depois do boot;
 *   2. com treino em andamento a atualização é adiada (correto — recarregar no
 *      meio da série é pior), MAS isso era invisível e não havia como forçar.
 *
 * Resultado: cada "está no ar" era verdade no servidor e mentira no aparelho, e
 * as duas partes passaram horas testando versões diferentes.
 */
describe('atualização do app (service worker)', () => {
    const src = readFileSync('src/components/ServiceWorkerRegister.tsx', 'utf8')

    it('checa versão nova JÁ NO BOOT, não só a cada 15 min', () => {
        expect(src).toMatch(/await reg\.update\(\)/)
    })

    it('continua adiando quando há treino em andamento', () => {
        // A proteção é correta: recarregar no meio de uma série perde o contexto.
        expect(src).toContain('workoutInProgress()')
        expect(src).toMatch(/if \(!hidden && workoutInProgress\(\)\) \{ setDeferredByWorkout\(true\); return \}/)
    })

    it('mas o adiamento deixa de ser invisível — vira aviso tocável', () => {
        expect(src).toContain('deferredByWorkout')
        expect(src).toContain('Atualização pronta')
        expect(src).toMatch(/const applyNow = \(\) => \{[\s\S]*?SKIP_WAITING/)
    })

    it('no caso normal segue silencioso — sem pedágio a cada deploy', () => {
        // Só aparece quando ficaria preso; se dá pra aplicar, aplica sozinho.
        expect(src).toMatch(/if \(!deferredByWorkout \|\| updating\) return null/)
    })

    it('durante o treino só aplica por toque explícito', () => {
        // applyNow existe e é chamado APENAS pelo onClick do aviso — nenhum
        // efeito o dispara sozinho.
        expect(src).toMatch(/onClick=\{applyNow\}/)
        expect((src.match(/applyNow/g) || []).length).toBe(2) // definição + onClick
    })
})
