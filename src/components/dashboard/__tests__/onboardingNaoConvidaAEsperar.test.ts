import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O estado vazio da lista de treinos não pode oferecer ESPERAR como
 * alternativa a criar.
 *
 * Medido em produção, 29/08/2026 — o funil inteiro:
 *
 *   59 cadastrados → 20 com treino criado (34%) → 17 treinaram (29%)
 *   → 6 ativos em 30 dias (10%)
 *
 * Das 25 pessoas que foram aprovadas, logaram e nunca criaram um treino,
 * **22 não têm professor** e **13 tiveram só a primeira sessão**. A frase
 * "ou espere o treino do seu professor" dava a 88% delas uma desculpa para não
 * agir, apontando para alguém que não existe.
 *
 * Guard de forma: o `StudentDashboard` exige Supabase, bootstrap e ~20 props —
 * montá-lo aqui mediria o harness. O que este caso trava é a frase voltar a
 * oferecer a espera como saída.
 */

const SRC = readFileSync(join(process.cwd(), 'src/components/dashboard/StudentDashboard.tsx'), 'utf8')
const semComentarios = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('estado vazio da lista de treinos', () => {
    it('não oferece esperar como alternativa a criar', () => {
        expect(
            semComentarios,
            'a espera não pode ser o "ou" de uma frase cuja outra metade é a ação',
        ).not.toMatch(/ou espere o treino/)
    })

    it('a ação primária continua sendo criar', () => {
        // Ancorado no que FICA: sem este caso, apagar o estado vazio inteiro
        // deixaria o de cima verde e cego.
        expect(semComentarios).toContain('Criar meu primeiro treino')
    })

    it('e quem TEM professor continua sabendo que o treino dele chega aqui', () => {
        // Tirar a menção resolveria os 88% e cegaria os 12%.
        expect(semComentarios).toMatch(/professor.{0,40}aparece aqui/)
    })
})
