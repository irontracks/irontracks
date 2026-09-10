import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O INICIAR da semana de descarga mora no menu "…" do header.
 *
 * Origem (10/09/2026): o controle vivia no `SessionDeloadBanner`, atrás de
 * `emCiclo || autoLoadEnabled`. O dono treina com a carga automática DESLIGADA —
 * sem ciclo e sem autoload, os dois lados eram falsos, e o botão para COMEÇAR um
 * ciclo só existiria se já houvesse um ciclo. Ele procurou no app e não achou.
 *
 * Guard de FORMA porque montar o `WorkoutHeader` exigiria os contextos de
 * workout, timer e team — mediria o harness, não o componente. Ele trava as duas
 * propriedades que a correção precisa manter: o item existe no menu, e sua
 * visibilidade NÃO depende da carga automática.
 */
const src = readFileSync(join(process.cwd(), 'src/components/workout/WorkoutHeader.tsx'), 'utf8')
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('semana de descarga no menu do header', () => {
  it('o item existe no menu "…"', () => {
    expect(semComentarios).toMatch(/Semana de Deload/)
    expect(semComentarios).toMatch(/startDeloadCycle\?\.\(/)
    expect(semComentarios).toMatch(/endDeloadCycle\?\.\(\)/)
  })

  it('oferece as três durações', () => {
    expect(semComentarios).toMatch(/\[3,\s*5,\s*7\]/)
  })

  it('em ciclo, o item vira encerrar', () => {
    expect(semComentarios).toMatch(/emCicloDeDescarga\s*\?/)
    expect(semComentarios).toMatch(/Encerrar Deload/)
  })

  // O CORAÇÃO DO GUARD: nada que decida a descarga pode olhar para autoLoad.
  // Se alguém reintroduzir o acoplamento, o botão volta a ficar inalcançável
  // para quem treina com a carga automática desligada.
  it('nada no header condiciona a descarga à carga automática', () => {
    expect(semComentarios).not.toMatch(/autoLoadEnabled/)
  })

  it('o status é lido pelo lado positivo, não por !== inactive', () => {
    expect(semComentarios).toMatch(/deloadCycleStatus === 'active' \|\| deloadCycleStatus === 'ends_today'/)
    expect(semComentarios).not.toMatch(/deloadCycleStatus !== 'inactive'/)
  })
})
