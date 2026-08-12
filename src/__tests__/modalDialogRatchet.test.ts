/**
 * Ratchet: overlay de tela inteira sem semântica de janela (12/08/2026).
 *
 * ## O que estava acontecendo
 * 76 componentes desenham um `fixed inset-0`. Em 42 deles não havia
 * `role="dialog"`: para o leitor de tela, abrir a janela não anunciava nada, ela
 * não tinha nome, e o conteúdo por baixo seguia sendo lido como se ainda
 * estivesse ao alcance.
 *
 * ## Por que uma lista, e não uma correção de uma vez
 * Corrigir os 42 numa tacada exigiria tocar em Story composer, avaliação por
 * foto, área do professor e chat — áreas que nunca foram auditadas — e
 * `aria-modal` só é honesto acompanhado de `useFocusTrap`, que MUDA
 * comportamento (foco automático ao abrir, teclado subindo no iOS). Isso não se
 * entrega no escuro. O primeiro lote foi o fluxo mais usado do app: os 12
 * modais do treino ativo.
 *
 * ## A regra
 * A lista **só encolhe**. Arquivo novo com `fixed inset-0` e sem semântica de
 * janela reprova; entrada que já foi corrigida e continua aqui também reprova —
 * sem essa segunda metade a lista vira papel de parede e o débito fica
 * congelado com cara de resolvido.
 *
 * ## Cuidado ao remover uma entrada
 * Nem todo `fixed inset-0` é modal: splash de carregamento, tela cheia de
 * navegação, banner de topo e a barra do descanso ocupam a tela sem serem
 * janela — e marcar essas como `dialog` seria pior que o silêncio de hoje,
 * porque o leitor de tela anunciaria com confiança uma coisa que não é verdade.
 * A triagem NÃO foi feita: a lista abaixo é bruta, e classificar cada caso é
 * parte do trabalho de quem for corrigir.
 *
 * Padrão a seguir: `dialogProps()` de `utils/a11y/backdrop` no container +
 * `useFocusTrap` + `backdropProps()` no fundo. Exemplo pronto:
 * `components/workout/Modals.tsx`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..')

/** Débito conhecido. SÓ ENCOLHE. */
const SEM_SEMANTICA_DE_JANELA = new Set([
    'components/ActiveWorkout.tsx',
    'components/AdminPanelV2.tsx',
    'components/CardioSessionModal.tsx',
    'components/CardioStoryComposer.tsx',
    'components/ChatDirectScreen.tsx',
    'components/ChatListScreen.tsx',
    'components/ExerciseEditor/EditorHeader.tsx',
    'components/GymQRCode.tsx',
    'components/HistoryList.tsx',
    'components/LoadingScreen.tsx',
    'components/LoginScreen.tsx',
    'components/NotificationCenter.tsx',
    'components/NutritionStoryComposer.tsx',
    'components/ProgressPhotos.tsx',
    'components/ServiceWorkerRegister.tsx',
    'components/StoryComposer.tsx',
    'components/StoryComposerIosSavePanel.tsx',
    'components/WorkoutReport.tsx',
    'components/admin-panel/StudentWorkoutsTab.tsx',
    'components/assessment/AssessmentButton.tsx',
    'components/assessment/QuickBIAModal.tsx',
    'components/body-photo/BodyPhotoCaptureModal.tsx',
    'components/body-photo/BodyPhotoHistoryModal.tsx',
    'components/dashboard/WeeklyMuscleSummary.tsx',
    'components/dashboard/WorkoutToolsPanel.tsx',
    'components/dashboard/nutrition/BarcodeScanner.tsx',
    'components/lab-exams/LabExamUploadModal.tsx',
    'components/lab-exams/LabExamsSection.tsx',
    'components/stories/StoryViewer.tsx',
    'components/student/StudentSubscriptionCard.tsx',
    'components/teacher-area/TeacherArea.tsx',
    'components/teacher-area/TeacherAreaNav.tsx',
    'components/teacher-area/TeacherChatHost.tsx',
    'components/teacher/ServicePlanModal.tsx',
    'components/teacher/TeacherControlModal.tsx',
    'components/teacher/TeacherUpgradeModal.tsx',
    'components/ui/PremiumUI.tsx',
    'components/vip/PeriodizationCreateModal.tsx',
    'components/workout/RestTimerOverlay.tsx',
    'components/workout/SessionDeloadBanner.tsx',
])

const listarTsx = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? (e.name === '__tests__' ? [] : listarTsx(`${dir}/${e.name}`))
      : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [],
  )

const TEM_JANELA = /role="dialog"|dialogProps\(/

const comOverlay = listarTsx('components')
  .map((rel) => ({ rel, src: readFileSync(join(SRC, rel), 'utf8') }))
  .filter((f) => f.src.includes('fixed inset-0'))

describe('ratchet de semântica de janela', () => {
  it('a varredura encontrou os overlays — a busca não quebrou', () => {
    expect(comOverlay.length).toBeGreaterThan(50)
  })

  it('nenhum overlay NOVO entra sem semântica de janela', () => {
    const novos = comOverlay
      .filter((f) => !TEM_JANELA.test(f.src))
      .map((f) => f.rel)
      .filter((rel) => !SEM_SEMANTICA_DE_JANELA.has(rel))

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
      .filter((f) => TEM_JANELA.test(f.src) && SEM_SEMANTICA_DE_JANELA.has(f.rel))
      .map((f) => f.rel)

    expect(jaCorrigidos, 'já tem semântica de janela — remova de SEM_SEMANTICA_DE_JANELA').toEqual([])
  })

  it('a lista não cita arquivo que sumiu ou perdeu o overlay', () => {
    const vivos = new Set(comOverlay.map((f) => f.rel))
    const fantasmas = [...SEM_SEMANTICA_DE_JANELA].filter((rel) => !vivos.has(rel))
    expect(fantasmas, 'entrada obsoleta — remova').toEqual([])
  })
})
