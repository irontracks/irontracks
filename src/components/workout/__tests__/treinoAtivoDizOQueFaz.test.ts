/**
 * Três achados da auditoria da tela do treino ativo (06/09/2026, confirmados
 * por uma segunda auditoria independente) — todos do tipo "a tela diz uma
 * coisa e faz outra":
 *
 *  1. O botão "Editar treino" mostrava um "+" no celular (o rótulo some abaixo
 *     de `sm`), ao lado do X de descartar: o usuário lia "adicionar".
 *  2. "Cardio com GPS" era o único item VERDE do menu — verde é "concluído"
 *     neste app, e o item é uma ação.
 *  3. Concluir uma série sem reps virava "Feito" verde em silêncio, e há aluno
 *     fazendo isso em 63% das séries — para ele volume, e1RM e carga sugerida
 *     ficam cegos. Agora a série avisa, numa linha, até as reps entrarem.
 *  4. O diálogo de finalizar dizia só "Deseja finalizar?" com 29 de 30 séries
 *     por fazer.
 *
 * Source-guards, com o limite declarado: o header e o normalSet exigem o
 * harness inteiro do treino para montar; o que se trava aqui é a FORMA que
 * corrige cada defeito, e o comportamento foi conferido no aparelho.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('header — o ícone diz o que o botão faz', () => {
  const header = semComentarios(ler('src/components/workout/WorkoutHeader.tsx'))
  const botaoEditar = header.slice(header.indexOf('openFullEditor?.()'), header.indexOf('Editar treino</span>'))

  it('o bloco do botão existe (senão o guard fica cego)', () => {
    expect(botaoEditar.length).toBeGreaterThan(100)
  })

  it('Editar treino usa lápis, não "+", e tem nome acessível', () => {
    expect(botaoEditar).toContain('<Pencil')
    expect(botaoEditar).not.toContain('<Plus')
    expect(botaoEditar).toMatch(/aria-label="Editar treino"/)
  })

  it('nenhum item do menu "…" é verde', () => {
    const menu = header.slice(header.indexOf('overflowOpen && ('), header.indexOf('Convidar'))
    expect(menu.length).toBeGreaterThan(200)
    expect(menu).not.toMatch(/text-(emerald|green)-\d00/)
  })
})

describe('série concluída sem reps avisa', () => {
  const normal = semComentarios(ler('src/components/workout/set-renderers/normalSet.tsx'))

  it('o aviso existe e depende de done + reps vazias', () => {
    const i = normal.indexOf('aviso-sem-reps')
    expect(i).not.toBe(-1)
    const condicao = normal.slice(Math.max(0, i - 200), i)
    expect(condicao).toMatch(/done\s*&&/)
    expect(condicao).toMatch(/!extReps\.trim\(\)/)
  })

  it('é âmbar (aviso), não vermelho (erro) nem verde', () => {
    const i = normal.indexOf('aviso-sem-reps')
    const linha = normal.slice(i, i + 200)
    expect(linha).toMatch(/text-amber-/)
    expect(linha).not.toMatch(/text-red-|text-emerald-|text-green-/)
  })
})

describe('finalizar diz o que falta', () => {
  const finish = semComentarios(ler('src/components/workout/hooks/useWorkoutFinish.ts'))

  it('a pergunta recebe o progresso real (exercícios + logs)', () => {
    expect(finish).toMatch(/buildFinishQuestion\(\s*deferredPendingNames\s*,\s*progressoDoTreino\(\s*exercises\s*,\s*logs\s*\)\s*\)/)
  })
})
