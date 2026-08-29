import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards da varredura de design da área administrativa (28/08/2026).
 *
 * São de FORMA e de FIAÇÃO por decisão: `AdminPanelV2` monta o painel inteiro
 * (Supabase, 15 abas com import dinâmico, contexto de admin) — um teste de
 * render ali mediria o harness, não o app. O que aparece na tela foi conferido
 * no simulador; o que estes casos travam é o padrão voltar.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const PAINEL = 'src/components/AdminPanelV2.tsx'
const BOTTOM_TABS = 'src/components/admin-panel/AdminPanelBottomTabs.tsx'
const ALUNOS = 'src/components/admin-panel/StudentsTab.tsx'
const PRIORIDADES = 'src/components/admin-panel/PrioritiesTab.tsx'
const SOLICITACOES = 'src/components/admin/RequestsTab.tsx'

describe('o conteúdo não desliza na fresta acima dos chips', () => {
    /**
     * Os chips de sub-aba são `sticky top-0` DENTRO do container de rolagem.
     * Padding no topo desse container fica acima da zona de grude, e nesses
     * pixels o conteúdo rola à vista: na aba Alunos aparecia uma faixa com
     * "Pago", "MK" e dois ícones cortados ao meio, presa entre o cabeçalho e os
     * chips, o tempo todo.
     */
    const containerDoScroll = (): string => {
        const fonte = semComentarios(ler(PAINEL))
        // Fatia pela ABERTURA da div que rola até o filho sticky — é o trecho
        // onde a classe mora.
        const at = fonte.indexOf('overflow-y-auto')
        expect(at, 'o container de rolagem sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const inicio = fonte.lastIndexOf('<div', at)
        return fonte.slice(inicio, fonte.indexOf('>', at) + 1)
    }

    it('o container que hospeda os chips sticky não tem padding no topo', () => {
        expect(
            containerDoScroll(),
            'padding-top aqui vira fresta: o conteúdo aparece acima dos chips enquanto rola',
        ).not.toMatch(/\bpt-[\w.[\]]+/)
    })

    it('e ele continua sendo o container que os chips habitam', () => {
        // Sem esta metade, mover os chips para fora deixaria o caso acima verde
        // e sem sentido.
        const fonte = semComentarios(ler(PAINEL))
        expect(fonte).toMatch(/overflow-y-auto[\s\S]{0,400}<AdminPanelSubTabs/)
    })

    it('o respiro do conteúdo continua existindo, no filho que rola junto', () => {
        expect(semComentarios(ler(PAINEL))).toMatch(/<AdminPanelSubTabs[\s\S]{0,600}className="pt-2"/)
    })
})

describe('o badge de solicitações não fica preso no número velho', () => {
    it('quem resolve uma solicitação avisa', () => {
        const fonte = semComentarios(ler(SOLICITACOES))
        expect(
            fonte,
            'sem o aviso, o badge só reconta ao navegar — e o caminho natural é resolver várias sem sair da aba',
        ).toMatch(/avisarSolicitacoesMudaram\s*\(/)
    })

    it('o badge escuta', () => {
        expect(semComentarios(ler(BOTTOM_TABS))).toMatch(/ouvirSolicitacoesMudaram\s*\(/)
    })

    it('e a assinatura é desfeita na limpeza do efeito', () => {
        const fonte = semComentarios(ler(BOTTOM_TABS))
        expect(fonte).toMatch(/return\s*\(\)\s*=>\s*\{[^}]*pararDeOuvir\s*\(\)/)
    })
})

describe('um fato, um lugar: o status do aluno', () => {
    it('o badge de status só existe para quem NÃO tem o select', () => {
        const fonte = semComentarios(ler(ALUNOS))
        // Ancorado em `badgeDeStatus(`, que é o que FICA. A primeira versão
        // mirava em `statusBadgeClass(`, removido quando o vocabulário de
        // status ganhou fonte única — e o caso quebrou na hora, como devia.
        const at = fonte.indexOf('badgeDeStatus(')
        expect(at, 'o badge de status sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        // Os ~200 caracteres antes do badge têm que carregar a condição.
        expect(
            fonte.slice(Math.max(0, at - 200), at),
            'o admin já edita o status no `<select>` logo abaixo; o badge repetia o mesmo fato no canto onde o olho procura o estado',
        ).toMatch(/\{\s*!isAdmin\s*&&/)
    })

    it('o rótulo do badge sai da mesma tabela do gráfico', () => {
        expect(semComentarios(ler(ALUNOS))).toMatch(/rotuloDeStatus\s*\(/)
    })
})

describe('a área administrativa fala português', () => {
    it('nenhuma tela exibe "Churn"', () => {
        // `churnDays` (minúsculo) é chave de API e continua valendo — o que sai
        // daqui é o termo com cara de rótulo.
        for (const arquivo of [PRIORIDADES, 'src/components/admin-panel/DashboardTab.tsx']) {
            expect(semComentarios(ler(arquivo)), `${arquivo} exibe jargão de métrica de SaaS`).not.toMatch(/\bChurn\b/)
        }
    })

    it('nenhuma tela exibe "Coach Inbox"', () => {
        for (const arquivo of [PRIORIDADES, 'src/components/admin-panel/DashboardTab.tsx']) {
            expect(semComentarios(ler(arquivo))).not.toMatch(/Coach Inbox/)
        }
    })

    it('a fila do coach tem título, e ele está em português', () => {
        // Ancorado no que FICA: sem este caso, apagar o título deixaria os dois
        // acima verdes e cegos.
        expect(semComentarios(ler(PRIORIDADES))).toMatch(/Sua fila/)
    })
})

describe('o gráfico de status consome o módulo, não uma lista fixa', () => {
    const NAV = 'src/components/admin-panel/hooks/useAdminNavigation.ts'

    it('as fatias vêm de `resumirStatusDeAlunos`', () => {
        expect(semComentarios(ler(NAV))).toMatch(/resumirStatusDeAlunos\s*\(/)
    })

    it('nenhuma lista fixa de rótulos sobrou no hook', () => {
        const fonte = semComentarios(ler(NAV))
        expect(fonte, 'a lista fixa desenhava três colunas permanentemente vazias').not.toMatch(/'Cancelar'/)
        expect(fonte).not.toMatch(/'Outros'/)
    })
})

// ─── Sprint 2 ────────────────────────────────────────────────────────────────

describe('o vocabulário de status tem UM dono', () => {
    it('a lista de alunos não mantém listas próprias', () => {
        const fonte = semComentarios(ler(ALUNOS))
        expect(fonte, 'STATUS_OPTIONS não conhecia `ativo` — 43% da base').not.toMatch(/const STATUS_OPTIONS\s*=/)
        expect(fonte, 'o switch de classes conhecia três status').not.toMatch(/const statusBadgeClass\s*=/)
    })

    it('e consome o módulo para opções, badge e normalização', () => {
        const fonte = semComentarios(ler(ALUNOS))
        for (const fn of ['opcoesDeStatus(', 'badgeDeStatus(', 'normalizarStatus(']) {
            expect(fonte, `${fn} deveria vir da fonte única`).toContain(fn)
        }
    })

    it('o diálogo de confirmação usa o mesmo rótulo', () => {
        const fonte = semComentarios(ler('src/components/admin-panel/hooks/useAdminActions.ts'))
        expect(fonte, 'era a quarta lista — a única com emoji').not.toMatch(/const statusLabels\s*=/)
        expect(fonte).toMatch(/rotuloDeStatus\s*\(/)
    })

    it('ninguém mais inventa "pendente" para aluno sem status', () => {
        // Era a regra que fazia card e gráfico discordarem: aqui vazio não
        // contava, lá vazio VIRAVA pendente.
        for (const arquivo of [
            ALUNOS,
            'src/components/admin-panel/DashboardTab.tsx',
            'src/components/admin-panel/hooks/useAdminNavigation.ts',
            'src/components/admin-panel/hooks/useAdminActions.ts',
            'src/components/admin-panel/StudentDetailPanel.tsx',
        ]) {
            expect(semComentarios(ler(arquivo)), `${arquivo} ainda inventa "pendente"`).not.toMatch(/\|\|\s*'pendente'/)
        }
    })
})

describe('"Ativos" não pode significar duas coisas na mesma tela', () => {
    const DASH = 'src/components/admin-panel/DashboardTab.tsx'

    it('o card que conta `pago` se chama Pagantes', () => {
        const fonte = semComentarios(ler(DASH))
        expect(fonte).toContain('Pagantes')
        // Existe um status `ativo` (43% da base) que é OUTRA coisa, e o gráfico
        // logo abaixo o mostra com esse nome.
        expect(fonte, 'o card rotulado "Ativos" contava `pago`').not.toMatch(/>Ativos</)
    })

    it('e conta pela fonte única', () => {
        expect(semComentarios(ler(DASH))).toMatch(/normalizarStatus\(u\?\.status\)\s*===\s*'pago'/)
    })

    it('NENHUMA contagem de status normaliza à mão', () => {
        // Guard de CLASSE, não do caso: mirar em `|| 'pendente'` deixa passar
        // `String(u?.status || '').toLowerCase()`, que é a mesma decisão escrita
        // de novo — e foi essa forma que fez card e gráfico discordarem.
        // Provado por mutação: repor aquela expressão reprova aqui.
        const fonte = semComentarios(ler(DASH))
        expect(
            fonte,
            'compare status pelo `normalizarStatus` — regra própria diverge em silêncio',
        ).not.toMatch(/String\([^)]*\.status[^)]*\)\s*\.toLowerCase\(\)/)
    })

    it('e as contagens continuam existindo — o guard acima precisa de alvo', () => {
        const fonte = semComentarios(ler(DASH))
        expect(fonte).toMatch(/normalizarStatus\(u\?\.status\)\s*===\s*'pendente'/)
    })
})

describe('os chips de filtro cobrem todos os status que existem', () => {
    it('saem dos dados, não de uma lista fixa', () => {
        const fonte = semComentarios(ler(ALUNOS))
        expect(fonte).toMatch(/resumirStatusDeAlunos\s*\(/)
        // A lista fixa tinha um chip "Ativos" que filtrava `pago`, e NENHUM
        // chip para `ativo`: aqueles alunos não eram alcançáveis por filtro.
        expect(fonte).not.toMatch(/key:\s*'pago',\s*label:\s*'Ativos'/)
    })
})

describe('um fato, um lugar: os gráficos', () => {
    const DASH = 'src/components/admin-panel/DashboardTab.tsx'

    it('"Distribuição por Professor" saiu — o card acima já diz os dois números', () => {
        expect(semComentarios(ler(DASH))).not.toContain('Distribuição por Professor')
    })

    it('e o dado que o alimentava não ficou órfão no hook', () => {
        expect(semComentarios(ler('src/components/admin-panel/hooks/useAdminNavigation.ts')))
            .not.toMatch(/teacherDistribution/)
    })

    it('o gráfico de status continua lá — não foi isso que saiu', () => {
        expect(semComentarios(ler(DASH))).toContain('Status dos Alunos')
    })
})

describe('a fila não repete a mesma frase três vezes', () => {
    it('o último treino só aparece quando o motivo NÃO fala dele', () => {
        const fonte = semComentarios(ler(PRIORIDADES))
        // Em `churn_risk` o `reason` da API já é "N dias sem treinar".
        expect(fonte).toMatch(/item\.kind\s*!==\s*'churn_risk'[\s\S]{0,300}formatLastWorkout/)
    })

    it('e continua aparecendo nos outros motivos, onde é dado novo', () => {
        expect(semComentarios(ler(PRIORIDADES))).toMatch(/formatLastWorkout\(item\.last_workout_at\)/)
    })
})

describe('os selects da lista de alunos dizem o que são', () => {
    it('cada um tem rótulo visível, não só `aria-label`', () => {
        const fonte = semComentarios(ler(ALUNOS))
        expect(fonte, 'o olho não tinha como saber qual select é qual').toContain('>Pagamento<')
        expect(fonte).toContain('>Professor<')
    })
})
