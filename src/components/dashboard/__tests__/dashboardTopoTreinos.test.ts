/**
 * Guards da auditoria de design do topo da aba TREINOS (11/08/2026).
 *
 * O achado central: numa aba chamada TREINOS, o primeiro treino só aparecia no
 * rodapé da primeira tela. Medido no iPhone 17 Pro Max — cabeçalho + abas
 * (~190pt) + estado vazio de stories (~167pt) + três CTAs de criação (~220pt)
 * consumiam cerca de dois terços da altura antes do primeiro card.
 *
 * A causa não era uma decisão errada, e sim uma AUSÊNCIA: o `QuickStartCard`
 * ocupa o topo e resolve o caso comum, mas retornava `null` quando o usuário já
 * tinha treinado no dia. O espaço não era reatribuído — quem subia era o estado
 * vazio da barra de stories, por gravidade.
 *
 * São guards de SOURCE, não de render: o resultado na tela foi conferido no
 * simulador (ver o PR). jsdom não mede layout, então um teste de render aqui
 * provaria menos do que promete.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..')
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

/** Reduz ao código executável — sem isto o guard casa com o comentário que explica a regra. */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('o topo não fica órfão quando o usuário já treinou', () => {
  const src = read('QuickStartCard.tsx')

  it('trainedToday tem tratamento próprio, não cai no return null geral', () => {
    const code = codeOnly(src)
    // O antigo `if (hasActiveSession || trainedToday || !alvo) return null` é
    // exatamente o que não pode voltar: colapsa três casos distintos em nada.
    expect(code).not.toMatch(/hasActiveSession\s*\|\|\s*trainedToday/)
    expect(code).toMatch(/if \(trainedToday\)/)
  })

  it('mostra o estado de conclusão em vez de sumir', () => {
    expect(src).toMatch(/Treino concluído hoje/)
  })

  it('com treino EM ANDAMENTO o topo continua calado', () => {
    // A tela já está falando do treino; repetir no topo é ruído.
    expect(codeOnly(src)).toMatch(/if \(hasActiveSession\) return null/)
  })
})

describe('estado vazio de stories não ocupa o espaço de um card cheio', () => {
  const src = read('StoriesBar.tsx')
  const vazio = /ordered\.length === 0 && !loading && !error \? \(([\s\S]*?)\) : null/.exec(src)?.[1] ?? ''

  it('o bloco do estado vazio existe e foi encontrado pelo guard', () => {
    expect(vazio).not.toBe('')
  })

  it('não usa o dourado — ele é reservado para ação primária', () => {
    expect(vazio).not.toMatch(/yellow-/)
  })

  it('não volta a ser bloco alto e centralizado', () => {
    expect(vazio).not.toMatch(/text-center/)
    expect(vazio).not.toMatch(/py-5/)
  })

  it('continua acionável — reduzir peso não é remover a ação', () => {
    expect(vazio).toMatch(/setIsCreatorOpen\(true\)/)
  })
})

describe('card de treino — tipografia', () => {
  const src = read('WorkoutCard.tsx')
  const titulo = /<h3[^>]*>\{String\(w\?\.title/.exec(src)?.[0] ?? ''
  const meta = /<p className="text-\[11px\] text-neutral-400 font-mono[^"]*"/.exec(src)?.[0] ?? ''

  it('o título não força caixa alta (custa ~12% de largura)', () => {
    expect(titulo).not.toBe('')
    expect(titulo).not.toMatch(/uppercase/)
  })

  it('o título mantém a assinatura de peso do app', () => {
    expect(titulo).toMatch(/font-black/)
  })

  it('o título desvia do botão de ações — agora um só, não três', () => {
    // pr-16 (64px) cobre o unico botao de 44pt; pr-40 era para os tres.
    expect(titulo).toMatch(/pr-16/)
  })

  it('a linha de meta NÃO reserva espaço para os botões — ela fica abaixo deles', () => {
    // Era o que deixava "10 exercícios · ~91 min ·" com o separador órfão.
    expect(meta).not.toBe('')
    expect(meta).not.toMatch(/pr-40/)
  })
})

describe('atalhos de criar treino recolhem quando já há treinos', () => {
  const src = read('StudentDashboard.tsx')
  const code = codeOnly(src)

  it('o botão fechado só existe para quem tem treinos', () => {
    expect(code).toMatch(/temTreinoAtivo && !criarAberto/)
  })

  it('com a lista VAZIA os três seguem abertos — aí criar é a ação primária', () => {
    // Recolher no onboarding esconderia a única coisa que o usuário pode fazer.
    expect(code).toMatch(/!temTreinoAtivo \|\| criarAberto/)
  })

  /**
   * `workouts.length` inclui ARQUIVADOS. Com todos os treinos arquivados a tela
   * se contradizia: topo no estado "já tem treinos" (botão recolhido) e corpo
   * dizendo "Nenhum treino criado" com CTA de primeiro treino. Visto no
   * aparelho em 11/08/2026 — o defeito nasceu na rodada anterior desta mesma
   * auditoria.
   */
  it('a pergunta "tem treino?" ignora os arquivados', () => {
    expect(code).toMatch(/temTreinoAtivo = useMemo\(\(\) => workouts\.some\(\(w\) => !w\?\.archived_at\)/)
    // Nenhum ramo de UI pode voltar a decidir pelo tamanho cru do array.
    expect(code).not.toMatch(/workouts\.length === 0/)
    expect(code).not.toMatch(/workouts\.length > 0/)
  })

  it('o botão fechado não usa dourado sólido — criar deixou de ser primária', () => {
    const fechado = /onClick=\{\(\) => setCriarAberto\(true\)\}[\s\S]{0,400}?>/.exec(src)?.[0] ?? ''
    expect(fechado).not.toBe('')
    expect(fechado).toMatch(/bg-yellow-500\/\[0\.06\]/)
    // `bg-yellow-500` puro (sólido) é do CTA de iniciar treino.
    expect(fechado).not.toMatch(/bg-yellow-500["\s]/)
  })

  it('dá para recolher de volta', () => {
    expect(code).toMatch(/setCriarAberto\(false\)/)
  })
})

describe('Iron Rank — unidade separada do número', () => {
  // Blindando a CLASSE, não a instância: eu tinha corrigido só o "levantados" e
  // este guard pegou outras TRÊS ocorrências no mesmo arquivo — inclusive o
  // "próx. 500.000kg" logo abaixo, visível na mesma tela.
  it('nenhum número cola na unidade kg', () => {
    const src = read('IronRankCard.tsx')
    expect(src).toMatch(/&#8201;kg/)
    expect(src).not.toMatch(/toLocaleString\([^)]*\)\}kg/)
  })
})

/**
 * Achado do bloco B da auditoria — só visível em tela ESTREITA.
 *
 * Os três botões de ação (Arquivados / Organizar / Ferramentas) usavam `flex-1`
 * puro: dividem a largura em partes iguais, mas o CONTEÚDO não encolhe junto.
 * Em 440pt (iPhone 17 Pro Max) cabia; em 390pt (iPhone 16e) o "FERRAMENTAS"
 * vazava para fora da tela. Nenhum teste pegaria isso — jsdom não mede layout —,
 * mas o guard trava as duas propriedades que impedem o corte.
 */
describe('linha de ações não transborda em tela estreita', () => {
  const src = readFileSync(join(DIR, 'StudentDashboard.tsx'), 'utf8')
  const linha = /Linha 2: botões de ação[\s\S]{0,6000}?Ferramentas<\/span>/.exec(src)?.[0] ?? ''

  it('o guard encontrou o bloco', () => {
    expect(linha).not.toBe('')
  })

  it('a linha pode quebrar em vez de cortar', () => {
    expect(linha).toMatch(/flex flex-wrap items-center/)
  })

  it('cada botão tem largura mínima — é ela que dispara o wrap antes do corte', () => {
    const minWidths = linha.match(/min-w-\[120px\]/g) ?? []
    expect(minWidths.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * O SHELL também empilha coisa acima da ação primária — e este guard não via.
 *
 * `StudentDashboard` abre com o comentário "AÇÃO PRIMÁRIA PRIMEIRO" e o
 * `QuickStartCard` como primeiro filho. Só que `IronTracksAppClientImpl`
 * renderiza irmãos ANTES dele, e um deles — o `HealthWidget` — não é
 * condicional a nada além de o Apple Health estar ligado: aparecia TODO dia,
 * com ~90pt de passos, kcal, FC e HRV empurrando o "Treinar agora" para baixo.
 *
 * É a lição do PR #747 reaparecendo por FORA do container que aquele PR
 * corrigiu — o mesmo padrão do `NutritionOverlay`, que escapou do #802 por
 * estar POR CIMA do shell: **corrigir o contêiner não corrige quem está
 * em volta dele.**
 *
 * Passos, kcal e HRV são dados de CONSULTA. Nada ali é acionável agora, e o
 * repo já decidiu, no #747, que progresso é o que se olha DEPOIS de decidir
 * treinar — foi por isso que Iron Rank, Recuperação e Mapa Muscular foram para
 * o fim da lista. O HealthWidget agora entra por slot, ao lado do
 * RecoveryScore, seu vizinho semântico.
 */
describe('shell: nada de consulta acima da ação primária', () => {
  const SHELL = join(process.cwd(), 'src', 'app', '(app)', 'dashboard', 'IronTracksAppClientImpl.tsx')
  const shell = codeOnly(readFileSync(SHELL, 'utf8'))

  it('o HealthWidget não renderiza acima do StudentDashboard', () => {
    const dashboard = shell.indexOf('<StudentDashboard')
    const widget = shell.indexOf('<HealthWidget')
    expect(dashboard, 'o StudentDashboard sumiu do shell').toBeGreaterThan(-1)
    if (widget === -1) return // não montado aqui: nada a checar
    expect(
      widget,
      'telemetria passiva acima da ação primária: ~90pt de passos/kcal/HRV ' +
      'empurram o "Treinar agora" para baixo numa aba chamada TREINOS',
    ).toBeGreaterThan(dashboard)
  })

  it('ele chega por slot, para o dashboard mandar na ORDEM', () => {
    expect(
      shell,
      'passado como prop de slot, quem decide a posição é o StudentDashboard — ' +
      'que é onde a regra do #747 está escrita',
    ).toMatch(/painelSaude=\{/)
  })
})
