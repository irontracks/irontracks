/**
 * Piso de corpo de texto (12/08/2026).
 *
 * Varredura das áreas nunca auditadas — story composer, avaliação por foto,
 * exames, área do professor — que acabou revelando uma tendência do app inteiro,
 * não das áreas: **142 ocorrências de `text-[9px]` em 61 arquivos, e 12 abaixo
 * disso**, incluindo um `text-[6px]` no overlay do descanso.
 *
 * ## O que é defensável e o que não é
 *
 * 95 dos 142 são *eyebrow labels* — maiúscula, `font-black`, `tracking` largo.
 * Nessa forma o glifo é alto e espaçado, e 9px lê bem; é uma escolha
 * deliberada do design system e fica. Os outros 47 são texto corrido em 9px,
 * e estão anotados como débito (não corrigidos aqui: subir 47 corpos muda
 * layout em 47 lugares, e isso não se entrega sem olhar cada um).
 *
 * **Abaixo de 9px não há forma que salve.** Os 12 encontrados eram todos label
 * maiúsculo — ou seja, o argumento do tracking já estava sendo usado no limite
 * e continuou encolhendo. O mínimo do iOS Human Interface Guidelines é 11pt, e
 * o contexto de uso aqui é academia: luz variável, aparelho longe do rosto,
 * usuário em movimento. E o público do app não é só gente de vinte anos —
 * presbiopia começa aos 40 e o texto de 6px simplesmente não existe para ela.
 *
 * O piso de 9px é o compromisso que o app já pratica em 95 lugares. Este guard
 * apenas impede que ele continue sendo furado.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', 'components')

const listar = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? (e.name === '__tests__' ? [] : listar(`${dir}/${e.name}`))
      : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  )

const arquivos = listar('.').map((r) => r.replace(/^\.\//, ''))

/** Qualquer corpo declarado abaixo de 9px. */
const ABAIXO_DO_PISO = /text-\[[1-8]px\]/

describe('piso de corpo de texto', () => {
  it('a varredura enxerga os componentes', () => {
    expect(arquivos.length).toBeGreaterThan(100)
  })

  it('nada é desenhado abaixo de 9px', () => {
    const infratores = arquivos
      .filter((rel) => ABAIXO_DO_PISO.test(readFileSync(join(ROOT, rel), 'utf8')))

    expect(
      infratores,
      'Abaixo de 9px não há maiúscula nem tracking que salve. O piso do app é ' +
      'text-[9px], praticado em 95 labels. Se falta espaço, corte conteúdo ou ' +
      'mude o layout — encolher a fonte só transfere o problema para o usuário.',
    ).toEqual([])
  })

  it('o guard tem alvo — a regex reconhece o padrão que ele proíbe', () => {
    // Sem isto, um erro na regex faria o caso acima passar para sempre.
    expect(ABAIXO_DO_PISO.test('className="text-[6px] uppercase"')).toBe(true)
    expect(ABAIXO_DO_PISO.test('className="text-[8px] font-black"')).toBe(true)
    expect(ABAIXO_DO_PISO.test('className="text-[9px] uppercase"')).toBe(false)
    expect(ABAIXO_DO_PISO.test('className="text-[10px]"')).toBe(false)
  })
})
