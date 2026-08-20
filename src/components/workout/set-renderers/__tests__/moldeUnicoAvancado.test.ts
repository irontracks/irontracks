/**
 * Todo método avançado que abre modal desenha a linha pelo MESMO molde.
 *
 * Por que existe: os 14 renderers de série são "irmãos que divergem em
 * silêncio" — cada um redesenhava a própria linha, e elas foram se afastando.
 * O dono viu o drop padronizado e perguntou pelos outros (20/08/2026): o
 * número ora em pílula ora em `#4` monoespaçado, o "Abrir" ora com largura
 * fixa ora escondendo o rótulo no celular (`hidden sm:inline`), o "Concluir"
 * ora ao lado ora numa segunda linha, e o chip de falha em três lugares.
 *
 * A correção não foi repetir o molde 12 vezes — foi ter UM (`AdvancedSetRow`).
 * Este guard trava a CLASSE: método NOVO que desenhe a linha por conta própria
 * reprova aqui, antes de chegar ao aparelho. É a única defesa contra a
 * divergência voltar pela porta dos fundos, que é como ela sempre voltou.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src/components/workout/set-renderers')

/**
 * Fora do molde por MOTIVO declarado — não por esquecimento.
 *
 * `normalSet` é a REFERÊNCIA da grade (o molde copia dela, não o contrário) e
 * tem peso/reps/RPE inline, com toda a maquinaria de campo focado.
 * `groupMethodSet` (Bi-Set, Super-Set, Tri-Set…) também é inline: o método não
 * tem modal, então não existe o botão "Abrir" que ocupa a faixa.
 */
const NAO_ABRE_MODAL: Record<string, string> = {
  'normalSet.tsx': 'é a referência da grade; campos inline',
  'groupMethodSet.tsx': 'método de grupo não tem modal — campos inline',
}

/** Só o código executável: comentário que CITA o padrão não é o padrão. */
const executavel = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const renderers = readdirSync(DIR)
  .filter((f) => f.endsWith('Set.tsx'))
  .map((f) => ({ nome: f, src: readFileSync(join(DIR, f), 'utf8') }))

describe('molde único da série avançada', () => {
  it('a varredura achou os renderers — a busca não quebrou', () => {
    expect(renderers.length).toBeGreaterThanOrEqual(14)
  })

  it('todo renderer com modal usa AdvancedSetRow', () => {
    const fora = renderers
      .filter((r) => !NAO_ABRE_MODAL[r.nome])
      .filter((r) => !/<AdvancedSetRow/.test(executavel(r.src)))
      .map((r) => r.nome)
    expect(
      fora,
      'Renderer de método avançado desenhando a própria linha. Use <AdvancedSetRow> — ' +
        'foi assim que os 14 divergiram da primeira vez. Se o método realmente não abre ' +
        'modal, declare o motivo em NAO_ABRE_MODAL.',
    ).toEqual([])
  })

  it('a exceção só vale para quem existe (lista não vira papel de parede)', () => {
    for (const nome of Object.keys(NAO_ABRE_MODAL)) {
      expect(renderers.some((r) => r.nome === nome), `${nome} não existe mais`).toBe(true)
    }
    // Quem já migrou não pode continuar na lista de exceção.
    const migradoEIsento = Object.keys(NAO_ABRE_MODAL).filter((nome) =>
      /<AdvancedSetRow/.test(executavel(renderers.find((r) => r.nome === nome)?.src ?? '')),
    )
    expect(migradoEIsento, 'já usa o molde — tire da lista de exceção').toEqual([])
  })

  it('quem usa o molde não redesenha a linha por fora dele', () => {
    // Sinais do desenho antigo: número monoespaçado `#N`, rótulo do Abrir
    // sumindo no celular, e o chip de falha solto no meio da linha de execução.
    const proibidos: Array<[RegExp, string]> = [
      [/text-xs font-mono text-neutral-400/, 'número da série no formato antigo (#N monoespaçado)'],
      [/hidden sm:inline/, '"Abrir" que some no celular'],
      [/<FailureToggle/, 'chip de falha desenhado fora do molde'],
    ]
    const falhas: string[] = []
    for (const r of renderers) {
      if (!/<AdvancedSetRow/.test(executavel(r.src))) continue
      const corpo = executavel(r.src)
      for (const [re, motivo] of proibidos) {
        if (re.test(corpo)) falhas.push(`${r.nome}: ${motivo}`)
      }
    }
    expect(falhas).toEqual([])
  })

  it('o molde desenha a MESMA grade da série normal', () => {
    const molde = readFileSync(join(DIR, 'AdvancedSetRow.tsx'), 'utf8')
    const normal = readFileSync(join(DIR, 'normalSet.tsx'), 'utf8')
    const grade = /gridTemplateColumns:\s*'32px 36px minmax\(0,1fr\) 92px'/
    expect(grade.test(molde), 'o molde perdeu a grade da série normal').toBe(true)
    expect(
      /gridTemplateColumns/.test(normal),
      'a série normal deixou de usar grade — reveja o molde junto',
    ).toBe(true)
    // Rodapé: informação à esquerda, falha à direita (falha é MARCAÇÃO, não execução).
    expect(molde.indexOf('methodLabel}')).toBeLessThan(molde.indexOf('<FailureToggle'))
  })
})
