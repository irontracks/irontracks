/**
 * O `user` do TeamWorkoutProvider precisa ser MEMOIZADO.
 *
 * A restauração do Treino em Dupla (18/08/2026) trouxe de volta a prop como
 * objeto literal: `teamUser={user?.id ? { id, email } : null}`. Referência nova
 * a cada render → os efeitos do provider (que dependem de `user`) re-disparam →
 * setState → render → objeto novo. Loop.
 *
 * `tsc`, ESLint e `next build` passam com isso. Quem pegou foi o E2E logado:
 * "element is not stable ... element was detached from the DOM" ao tentar
 * clicar em INICIAR TREINO — o card remontava sem parar. Depois do memo, a
 * suíte caiu de 3,1 min (2 falhas) para 1,7 min (tudo verde).
 *
 * Guard de fonte porque o defeito é de IDENTIDADE de referência: não há
 * asserção de comportamento em jsdom que o revele.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')

describe('prop `user` do TeamWorkoutProvider', () => {
    it('não é objeto literal no JSX', () => {
        expect(src, 'objeto literal aqui re-dispara os efeitos do provider a cada render')
            .not.toMatch(/teamUser=\{[^}]*\{\s*id:/)
    })

    it('vem de um useMemo com dependências estáveis', () => {
        expect(src).toMatch(/const teamUser = useMemo\(/)
        const bloco = src.slice(src.indexOf('const teamUser = useMemo('))
        expect(bloco.slice(0, 400)).toMatch(/\[user\?\.id, user\?\.email\]/)
    })
})
