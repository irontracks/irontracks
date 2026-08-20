/**
 * Overlay de tela cheia montado DENTRO da Nutrição precisa de portal.
 *
 * A Nutrição não é uma página: é o `NutritionOverlay`, um
 * `fixed inset-x-0 bottom-0 z-[25] overflow-y-auto` por cima do dashboard.
 * Quem nasce lá dentro herda dois problemas de uma vez:
 *
 *  1. **Stacking context** — `z-index` num elemento posicionado abre contexto
 *     novo. O `z-[1600]` de um modal filho não vale 1600 contra a página; vale
 *     25. O cabeçalho do app fica por cima.
 *  2. **Containing block** — dentro de um ancestral rolável (e de qualquer
 *     ancestral com `transform`), `position: fixed` deixa de se ancorar na
 *     viewport. O modal ROLA junto com a página e o topo — onde mora o botão
 *     Voltar — sai da tela.
 *
 * Os dois foram relatados pelo dono, com dois dias de diferença e telas
 * diferentes ("sem botão para sair dessa tela", 19 e 20/08/2026): o editor de
 * story e depois o histórico. Mesma causa, então o guard trava a CLASSE — o
 * próximo overlay que alguém montar aqui reprova antes de chegar ao aparelho.
 *
 * Aumentar o z-index não conserta nenhum dos dois. Só o portal conserta.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src/components/dashboard/nutrition')

/** Só o código executável — comentário que CITA o padrão não é o padrão. */
const executavel = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const TEM_PORTAL = /<FullscreenPortal>|createPortal\(/

const arquivos = readdirSync(DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ nome: f, src: readFileSync(join(DIR, f), 'utf8') }))

const overlays = arquivos.filter((f) => executavel(f.src).includes('fixed inset-0'))

describe('overlay dentro da Nutrição sai do contêiner por portal', () => {
  it('a varredura achou os overlays — a busca não quebrou', () => {
    // Se o diretório mudar de lugar, a lista esvazia e o teste abaixo passaria
    // vazio para sempre.
    expect(overlays.length).toBeGreaterThanOrEqual(3)
  })

  it('todo overlay de tela cheia usa portal', () => {
    const sem = overlays.filter((f) => !TEM_PORTAL.test(f.src)).map((f) => f.nome)
    expect(
      sem,
      'Overlay `fixed inset-0` dentro da Nutrição sem portal. Ele vai rolar junto ' +
      'com a página e o topo (botão Voltar) sai da tela — envolva em <FullscreenPortal>.',
    ).toEqual([])
  })

  it('o histórico e o scanner — os dois casos relatados — estão cobertos', () => {
    for (const nome of ['NutritionHistoryModal.tsx', 'BarcodeScanner.tsx']) {
      const alvo = overlays.find((f) => f.nome === nome)
      expect(alvo, `${nome} deixou de ser detectado como overlay`).toBeTruthy()
      expect(TEM_PORTAL.test(alvo!.src), `${nome} sem portal`).toBe(true)
    }
  })

  it('cada overlay mantém um jeito de sair', () => {
    for (const f of overlays) {
      expect(
        /aria-label="Voltar"|aria-label="Fechar"|onClose/.test(f.src),
        `${f.nome} não oferece saída`,
      ).toBe(true)
    }
  })
})
