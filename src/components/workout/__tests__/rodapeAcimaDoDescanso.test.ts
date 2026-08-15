/**
 * Guard do "Finalizar inalcançável durante o descanso" (achado no teste E2E de
 * 15/08/2026, com o app rodando: com o descanso ativo, a barra do
 * RestTimerOverlay (fixed bottom-0, z-[2100], renderizada na RAIZ) ficava por
 * cima do WorkoutFooter (fixed bottom-0, z-50, dentro do <ActiveWorkout> que é
 * um contexto de empilhamento) — e o botão de terminar o treino ficava
 * literalmente coberto. Para finalizar, o usuário tinha que esperar ou pular o
 * descanso.
 *
 * É a MESMA classe do bug dos modais (PR #833), mas no rodapé principal, que
 * aquele PR não cobria: lá a saída foi portal + z acima da barra; aqui as duas
 * barras disputam o MESMO espaço do rodapé, então sobrepor não resolveria —
 * o rodapé precisa SUBIR a altura da barra do descanso.
 *
 * Invariantes:
 *  1. O RestTimerOverlay publica a altura REAL da sua barra em
 *     `--it-rest-bar-h` (medida por ResizeObserver — a barra muda de altura
 *     com safe-area e com o botão AUTO; px chutado erra no notch) e REMOVE a
 *     variável ao desmontar (senão o rodapé fica flutuando para sempre).
 *  2. O WorkoutFooter posiciona seu `bottom` por essa variável, com fallback
 *     0px — sem descanso, nada muda.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const stripComments = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const overlay = stripComments(readFileSync('src/components/workout/RestTimerOverlay.tsx', 'utf8'))
const footer = stripComments(readFileSync('src/components/workout/WorkoutFooter.tsx', 'utf8'))

describe('rodapé do treino × barra do descanso', () => {
    it('o overlay publica a altura da barra em --it-rest-bar-h', () => {
        expect(overlay).toMatch(/setProperty\(\s*['"]--it-rest-bar-h['"]/)
    })

    it('a altura é MEDIDA do DOM (ResizeObserver), não um número chutado', () => {
        expect(overlay).toMatch(/ResizeObserver/)
        expect(overlay).toMatch(/getBoundingClientRect\(\)\.height/)
    })

    it('a variável é REMOVIDA ao desmontar (rodapé volta ao chão quando o descanso acaba)', () => {
        expect(overlay).toMatch(/removeProperty\(\s*['"]--it-rest-bar-h['"]\s*\)/)
    })

    it('o rodapé posiciona o bottom pela variável, com fallback 0px', () => {
        // Sem o fallback, um treino SEM descanso deixaria o rodapé sem bottom
        // definido — a barra sairia do lugar na tela inteira.
        expect(footer).toMatch(/bottom:\s*['"]var\(--it-rest-bar-h,\s*0px\)['"]/)
    })

    it('o rodapé NÃO fixa mais bottom-0 na classe (a classe venceria o style inline?) — regressão', () => {
        // `bottom-0` do Tailwind + style inline: o inline vence, mas manter a
        // classe é armadilha para o próximo que ler o código e "limpar" o style.
        expect(footer).not.toMatch(/className=\{`fixed bottom-0 left-0 right-0 z-50/)
    })
})
