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
        const at = fonte.indexOf('statusBadgeClass(')
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
