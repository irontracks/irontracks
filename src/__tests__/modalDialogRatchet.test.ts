/**
 * Ratchet: overlay de tela inteira sem semântica de janela.
 *
 * 76 componentes desenham um `fixed inset-0`. Em 42 não havia `role="dialog"`:
 * abrir a janela não anunciava nada, ela não tinha nome, e o conteúdo por baixo
 * seguia sendo lido como se estivesse ao alcance.
 *
 * ## A triagem (12/08/2026)
 *
 * A primeira versão desta lista era BRUTA — 40 caminhos sem classificação, com
 * um aviso de que nem todo `fixed inset-0` é janela. Isso era honesto e inútil:
 * quem fosse corrigir teria de refazer a análise, e o risco era alguém marcar um
 * splash como `dialog` — **atributo errado é pior que ausente**, porque o leitor
 * de tela passa a anunciar com confiança uma coisa falsa.
 *
 * A lista agora está separada por NATUREZA, e a distinção é observável no código,
 * não no nome do arquivo (`CardioSessionModal` não é modal; `SessionDeloadBanner`
 * é):
 *
 * - **janela** — cobre a tela com um véu escuro (`bg-black/NN`), o conteúdo fica
 *   centrado, e existe um fora para clicar. É o que vira `dialog`.
 * - **não é janela** — ocupa a tela porque É a tela (view de navegação, splash,
 *   visualizador imersivo), ou porque é outra coisa com semântica própria: menu
 *   (`role="menu"`), barra de descanso que não bloqueia, banner.
 *
 * ## A regra
 *
 * `JANELA_PENDENTE` **só encolhe**, nas duas direções: entrada nova reprova, e
 * entrada já corrigida que não sai também reprova. `NAO_E_JANELA` carrega o
 * motivo de cada uma — sem motivo, não entra, senão vira gaveta de silenciar
 * guard.
 *
 * Padrão a seguir: `dialogProps()` no container + `useFocusTrap` + `backdropProps()`
 * no fundo. Exemplos prontos: `workout/Modals.tsx`, `lab-exams/LabExamUploadModal.tsx`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..')

/**
 * NÃO são janelas — e por isso NÃO podem virar `dialog`. Cada uma com o motivo.
 */
const NAO_E_JANELA: Record<string, string> = {
  'components/ActiveWorkout.tsx': 'a TELA do treino ativo — view de navegação, não janela sobre a página',
  'components/AdminPanelV2.tsx': 'painel administrativo em tela cheia',
  'components/ChatDirectScreen.tsx': 'tela de conversa',
  'components/teacher-area/TeacherChatHost.tsx': 'só o CONTÊINER que monta o ChatDirectScreen em tela cheia — a superfície é a tela, e ela já está aqui',
  'components/ChatListScreen.tsx': 'tela de lista de conversas',
  'components/HistoryList.tsx': 'tela de histórico',
  'components/WorkoutReport.tsx': 'tela de relatório do treino',
  'components/LoadingScreen.tsx': 'splash de carregamento — não há nada para anunciar nem foco a prender',
  'components/dashboard/WeeklyMuscleSummary.tsx': 'tela do resumo semanal',
  'components/teacher-area/TeacherArea.tsx': 'tela da área do professor',
  'components/CardioSessionModal.tsx': 'apesar do nome, é tela cheia sem véu — sessão de cardio em andamento',
  'components/teacher/TeacherControlModal.tsx': 'idem: tela cheia de controle, sem backdrop',
  'components/stories/StoryViewer.tsx': 'visualizador imersivo em tela cheia (linguagem do formato story), não janela',
  'components/StoryComposer.tsx': 'editor em tela cheia',
  'components/NutritionStoryComposer.tsx': 'editor em tela cheia',
  'components/CardioStoryComposer.tsx': 'editor em tela cheia',
  'components/MetricsStoryComposer.tsx': 'editor em tela cheia',
  'components/StoryComposerIosSavePanel.tsx': 'painel de salvar em tela cheia',
  'components/dashboard/nutrition/BarcodeScanner.tsx': 'câmera em tela cheia',
  'components/workout/RestTimerOverlay.tsx': 'barra do descanso — cobre a tela sem bloquear a interação por baixo',
  'components/ExerciseEditor/EditorHeader.tsx': 'é um MENU (role="menu"), semântica própria — dialog seria errado',
  'components/workout/WorkoutFinishCelebration.tsx':
    'celebração TRANSITÓRIA de fim de treino — some sozinha em ~2,4s e usa role="status"/aria-live; dialog prenderia o foco num aviso que já passou',
  'components/ui/PremiumUI.tsx': 'ModalOverlay sem nenhum consumidor no repo (código morto, verificado)',
}

/** Janelas de verdade que ainda não têm a semântica. SÓ ENCOLHE. */
const JANELA_PENDENTE = new Set([
])
const listarTsx = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? (e.name === '__tests__' ? [] : listarTsx(`${dir}/${e.name}`))
      : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [],
  )

const TEM_JANELA = /role="dialog"|dialogProps\(/

/**
 * Só o código EXECUTÁVEL. Um arquivo que apenas EXPLICA `fixed inset-0` num
 * comentário — como o `FullscreenPortal`, que documenta o bug de stacking
 * context que ele resolve — não é um overlay, e acusá-lo é o guard reprovando
 * a documentação que o defende (armadilha nº 2 do repo).
 */
const executavel = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const comOverlay = listarTsx('components')
  .map((rel) => ({ rel, src: readFileSync(join(SRC, rel), 'utf8') }))
  .filter((f) => executavel(f.src).includes('fixed inset-0'))

describe('ratchet de semântica de janela', () => {
  it('a varredura encontrou os overlays — a busca não quebrou', () => {
    expect(comOverlay.length).toBeGreaterThan(50)
  })

  it('nenhum overlay NOVO entra sem semântica de janela', () => {
    const novos = comOverlay
      .filter((f) => !TEM_JANELA.test(f.src))
      .map((f) => f.rel)
      .filter((rel) => !JANELA_PENDENTE.has(rel) && !(rel in NAO_E_JANELA))

    expect(
      novos,
      'Overlay de tela inteira sem role="dialog". Use dialogProps() + useFocusTrap ' +
      '(modelo: components/workout/Modals.tsx). Se NÃO for uma janela — splash, ' +
      'tela cheia, banner —, não marque como dialog: um rótulo falso é pior que ' +
      'nenhum. Nesse caso, documente aqui por que fica de fora.',
    ).toEqual([])
  })

  it('entrada já corrigida sai da lista', () => {
    // Sem isto a lista nunca encolhe de verdade: o débito seria "resolvido" no
    // código e continuaria contabilizado aqui para sempre.
    const jaCorrigidos = comOverlay
      .filter((f) => TEM_JANELA.test(f.src) && JANELA_PENDENTE.has(f.rel))
      .map((f) => f.rel)

    expect(jaCorrigidos, 'já tem semântica de janela — remova de JANELA_PENDENTE').toEqual([])
  })

  it('a lista não cita arquivo que sumiu ou perdeu o overlay', () => {
    const vivos = new Set(comOverlay.map((f) => f.rel))
    const fantasmas = [...JANELA_PENDENTE, ...Object.keys(NAO_E_JANELA)].filter((rel) => !vivos.has(rel))
    expect(fantasmas, 'entrada obsoleta — remova').toEqual([])
  })

  it('nenhuma entrada mora nas DUAS listas', () => {
    // Pertencer a `JANELA_PENDENTE` e a `NAO_E_JANELA` ao mesmo tempo não quebra
    // o filtro — e é por isso que passa despercebido. As duas listas dizem
    // coisas opostas ("falta virar janela" × "não é janela"), então a duplicata
    // deixa a decisão registrada de forma ambígua e a allowlist vira papel de
    // parede. Aconteceu em 12/08/2026 ao mover o TeacherChatHost.
    const duplicadas = [...JANELA_PENDENTE].filter((rel) => rel in NAO_E_JANELA)
    expect(duplicadas, 'decida: ou falta semântica, ou não é janela').toEqual([])
  })
})
