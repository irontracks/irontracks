import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Só o que o navegador executa — comentário explicando o proibido não é o proibido. */
const semComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('bugs de render — Sprint 1 da auditoria de design', () => {
  /**
   * Havia um `<CardioGPSPanel>` sob `{showCardioPanel && …}` e uma segunda cópia
   * INCONDICIONAL 45 linhas abaixo. Como o componente não tem guarda interna, o
   * painel aparecia mesmo com a condição falsa — e em DOBRO quando verdadeira.
   * Isso anulava o `shouldShowCardioPanel`, que decide também se o menu do
   * treino oferece "Cardio GPS".
   */
  it('o painel de cardio é montado uma vez só, e sob condição', () => {
    const src = semComentarios(ler('src/components/ActiveWorkout.tsx'))
    const montagens = [...src.matchAll(/<CardioGPSPanel\b/g)]
    expect(montagens, 'o painel de cardio não pode ser montado mais de uma vez').toHaveLength(1)

    const antes = src.slice(0, montagens[0].index)
    expect(
      /\{\s*showCardioPanel\s*&&[^}]*$/.test(antes.slice(-120)),
      'a montagem precisa estar sob `showCardioPanel &&` — sem isso a flag vira decorativa',
    ).toBe(true)
  })

  /**
   * O ícone de play era um SVG com fill dourado FIXO. Sobre o fundo
   * `btn-gold-animated` (gradiente #b45309→#fbbf24 em loop) media 1,19:1 no pico
   * e sumia ciclicamente. O `!text-black` corrige só o rótulo — `fill` não herda.
   * A regra: o que fica DENTRO do botão sólido acompanha o fundo, como o rótulo.
   */
  it('nada dentro do CTA sólido fica dourado sobre dourado', () => {
    const src = semComentarios(ler('src/components/dashboard/WorkoutCard.tsx'))

    expect(src, 'gradiente dourado fixo no ícone do CTA').not.toMatch(/playGold/)

    // Todo ícone do bloco do botão precisa ramificar por `solidCta`.
    const ini = src.indexOf('data-tour="workout-start"')
    const fim = src.indexOf('</button>', ini)
    expect(ini, 'o botão de iniciar sumiu do arquivo').toBeGreaterThan(-1)
    const bloco = src.slice(ini, fim)

    const dourados = [...bloco.matchAll(/className=(?:"|\{`)([^"`]*(?:text-yellow|fill-yellow)[^"`]*)/g)]
      .filter((m) => !m[1].includes('solidCta'))
    expect(
      dourados.map((m) => m[1]),
      'ícone dourado sem ramificar por solidCta — sobre o fundo dourado ele desaparece',
    ).toEqual([])
  })
})
