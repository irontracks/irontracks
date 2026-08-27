/**
 * Guard do violeta — a cor da máquina (12/08/2026).
 *
 * O violeta já era, na prática, a cor de "isto quem decidiu foi o motor": card
 * CARGA AUTOMÁTICA, nota do autoload, campo de peso sugerido e o cartão de
 * ajuste vindo da avaliação por foto. Quatro superfícies, nenhuma combinada com
 * a outra — e cada uma escrevendo as classes à mão, com valores ligeiramente
 * diferentes.
 *
 * É o mesmo enredo dos macronutrientes, que custou uma tela com o carboidrato
 * azul num card e amarelo no card ao lado. Aqui o guard chega ANTES da
 * divergência: violeta em componente só pela fonte única.
 *
 * As exceções não são descuido — são os lugares onde violeta NÃO significa
 * máquina, e por isso não podem usar o token.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MACHINE_ACCENT, MACHINE_COLOR } from '../machineAccent'

const COMPONENTS = join(__dirname, '..', '..', '..', 'components')

/**
 * Violeta que NÃO quer dizer "a máquina decidiu" — e por isso fica fora do token.
 * Cada entrada carrega o motivo; sem motivo, não entra.
 */
const NAO_E_A_COR_DA_MAQUINA: Record<string, string> = {
  'workout-report/ReportMusclePieChart.tsx':
    'paleta CATEGÓRICA de gráfico: fatias vizinhas precisam de matizes distintos, e violeta é uma delas',
  'dashboard/StoriesBar.tsx':
    'anel do story em conic-gradient — linguagem visual estabelecida do formato, não um estado do app',
  'stories/StoryCreatorModal.tsx':
    'paleta oferecida AO USUÁRIO para pintar o texto dele; a escolha é dele, não do app',
  'admin-panel/VipTab.tsx':
    'roxo = tier ELITE em tela administrativa, convenção de plano e não de produto',
  'admin/AdminVipReports.tsx':
    'mesmo caso do VipTab — relatório administrativo, mesma convenção de tier',
}

/**
 * As DUAS raízes de tela. O guard varria só `src/components` — e telas inteiras
 * moram em `src/app` (a Comunidade, o Social, o Onboarding, as páginas
 * públicas). Nenhuma delas usa violeta hoje, e é exatamente por isso que a
 * varredura precisa alcançá-las: guard só vale onde ainda não há violação.
 *
 * É o terceiro guard deste repo com o mesmo ponto cego em 26–27/08/2026 — o de
 * alvo de toque já tinha ficado preso a `src/components` (2º buraco), e o de
 * UI-sem-backend nasceu varrendo só `.tsx`. A pergunta ao escrever guard nunca
 * é "pega o meu caso?", e sim **"onde ele NÃO olha?"**.
 */
const RAIZES = [COMPONENTS, join(COMPONENTS, '..', 'app')]

const listar = (raiz: string, dir: string): string[] =>
  readdirSync(join(raiz, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? (e.name === '__tests__' ? [] : listar(raiz, `${dir}/${e.name}`))
      : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  )

/**
 * Rótulo (o que a allowlist usa) + caminho ABSOLUTO (o que o `readFileSync`
 * precisa). Guardar só o rótulo e resolvê-lo contra `COMPONENTS` fazia o guard
 * procurar `src/components/app/(app)/…` e morrer em ENOENT.
 */
const arquivos = RAIZES.flatMap((raiz, i) =>
  listar(raiz, '.').map((rel) => {
    const limpo = rel.replace(/^\.\//, '')
    return { rotulo: (i === 0 ? '' : 'app/') + limpo, caminho: join(raiz, limpo) }
  }),
)
const VIOLETA = /violet-\d|purple-\d|#8b5cf6|#a855f7|139,\s*92,\s*246/i

describe('violeta só entra pela fonte única', () => {
  it('a varredura enxerga os componentes', () => {
    expect(arquivos.length).toBeGreaterThan(100)
  })

  it('nenhum componente escreve violeta à mão', () => {
    const infratores = arquivos.filter(({ rotulo, caminho }) => {
      if (rotulo in NAO_E_A_COR_DA_MAQUINA) return false
      const src = readFileSync(caminho, 'utf8')
      // Só o código: o comentário que EXPLICA a regra não pode acusá-la.
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      return VIOLETA.test(codigo)
    }).map(({ rotulo }) => rotulo)

    expect(
      infratores,
      'Violeta é a cor do que a MÁQUINA decidiu (lib/design/machineAccent). ' +
      'Importe MACHINE_ACCENT em vez de escrever a classe. Se neste caso o ' +
      'violeta NÃO significa máquina, registre em NAO_E_A_COR_DA_MAQUINA com o motivo.',
    ).toEqual([])
  })

  it('as exceções ainda usam violeta — entrada obsoleta reprova', () => {
    // Sem isto, a allowlist vira papel de parede: o arquivo muda, o violeta sai,
    // e a exceção fica registrada dando permissão a um caso que não existe mais.
    const mortas = Object.keys(NAO_E_A_COR_DA_MAQUINA).filter((rotulo) => {
      const alvo = arquivos.find((a) => a.rotulo === rotulo)
      if (!alvo) return true // o arquivo sumiu: a exceção também deve sumir
      return !VIOLETA.test(readFileSync(alvo.caminho, 'utf8'))
    })
    expect(mortas, 'não usa mais violeta — remova de NAO_E_A_COR_DA_MAQUINA').toEqual([])
  })
})

describe('o token diz o que promete', () => {
  it('dourado não vaza para dentro da cor da máquina', () => {
    // A regra é binária: violeta = a máquina decidiu, dourado = você decide.
    // Um âmbar aqui apagaria a distinção que o token existe para criar.
    const tudo = Object.values(MACHINE_ACCENT).join(' ')
    expect(tudo).not.toMatch(/amber|yellow|gold/i)
  })

  it('todo papel é de fato violeta', () => {
    for (const [papel, classes] of Object.entries(MACHINE_ACCENT)) {
      expect(classes, `${papel} deixou de ser violeta`).toMatch(/violet|139, 92, 246/)
    }
  })

  it('o matiz desenhado e as classes falam da mesma cor', () => {
    expect(MACHINE_COLOR).toBe('#8b5cf6')
    expect(MACHINE_ACCENT.toggleOn).toMatch(/139,\s*92,\s*246/)
  })

  it('os tons de texto passam o mínimo AA sobre o fundo do app', () => {
    // violet-300 (#c4b5fd) e violet-100 (#ede9fe): violeta escuro sobre preto é
    // ilegível na luz de uma academia, então a escala não pode descer.
    const canal = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const lum = (r: number, g: number, b: number) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
    const contra = (l: number) => (l + 0.05) / (0.0 + 0.05)

    expect(contra(lum(196, 181, 253))).toBeGreaterThan(4.5) // violet-300
    expect(contra(lum(237, 233, 254))).toBeGreaterThan(4.5) // violet-100
    expect(MACHINE_ACCENT.text).toBe('text-violet-300')
    // Sem opacidade: `/80` tornava o contraste dependente do que estava atrás.
    expect(MACHINE_ACCENT.text).not.toMatch(/\//)
  })
})
