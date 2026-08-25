import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NutritionHistoryModal from '@/components/dashboard/nutrition/NutritionHistoryModal'

/**
 * Histórico de nutrição — o irmão do Histórico de treino.
 *
 * A lista é um ATALHO DE NAVEGAÇÃO: tocar num dia abre aquele dia na própria
 * aba. Sem ela, chegar a três semanas atrás custava 21 toques na seta.
 */

const resposta = { data: [] as unknown[], error: null as unknown }
/** As REFEIÇÕES (o detalhe do card aberto e do PDF), não os agregados do dia. */
const refeicoes = { data: [] as unknown[], error: null as unknown }

// Duas coisas precisam ser distinguidas, e ignorar qualquer uma inverte o teste:
//
// 1. a TABELA — `nutrition_day_flags` tem a mesma cadeia select→eq→gte→lte, e um
//    mock que ignora o nome devolve as refeições como se fossem marcas de "dia
//    incompleto", sumindo com todos os dias da média;
// 2. as COLUNAS — o detalhe por refeição sai da MESMA tabela dos agregados
//    (`nutrition_meal_entries`), e só o select diz qual das duas é.
vi.mock('@/utils/supabase/client', () => ({
    createClient: () => ({
        from: (tabela: string) => ({
            select: (colunas?: string) => {
                const alvo = () => {
                    if (tabela === 'nutrition_day_flags') return { data: [], error: null }
                    return String(colunas ?? '').includes('food_name') ? refeicoes : resposta
                }
                return {
                    eq: () => ({
                        gte: () => ({ lte: () => Promise.resolve(alvo()) }),
                        // `.eq(user).eq(date)` — a busca das refeições de UM dia.
                        eq: () => Promise.resolve(alvo()),
                    }),
                }
            },
            insert: () => Promise.resolve({ error: null }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        }),
    }),
}))

const HOJE = '2026-08-16'

const abrir = (props: Partial<React.ComponentProps<typeof NutritionHistoryModal>> = {}) =>
    render(
        <NutritionHistoryModal
            open
            userId="u1"
            todayDate={HOJE}
            onPickDate={() => { }}
            onClose={() => { }}
            {...props}
        />,
    )

beforeEach(() => {
    resposta.data = [
        { date: '2026-08-16', calories: 900, protein: 70, carbs: 90, fat: 20 },
        { date: '2026-08-16', calories: 1500, protein: 110, carbs: 160, fat: 50 },
        { date: '2026-08-14', calories: 2000, protein: 150, carbs: 200, fat: 60 },
    ]
    resposta.error = null
    refeicoes.data = [
        { id: 'm1', date: '2026-08-14', created_at: '2026-08-14T13:20:00Z', food_name: 'Café da manhã', calories: 700, protein: 50, carbs: 70, fat: 20, items: [{ label: '100g aveia', grams: 100 }] },
        { id: 'm2', date: '2026-08-14', created_at: '2026-08-14T21:05:00Z', food_name: 'Janta', calories: 1300, protein: 100, carbs: 130, fat: 40, items: [] },
    ]
    refeicoes.error = null
})

describe('lista de dias', () => {
    it('mostra um dia por linha, com o total somado das refeições', async () => {
        abrir()
        expect(await screen.findByText('2400')).toBeInTheDocument()   // 900 + 1500
        expect(screen.getByText('2000')).toBeInTheDocument()
        expect(screen.getByText(/2 refeições/)).toBeInTheDocument()
    })

    /**
     * Pedido do dono (25/08/2026): tocar no card mostra as refeições DAQUELE
     * dia. Antes o toque fechava o modal e trocava a data da aba — que abre no
     * topo, com os lançamentos no fim da página, então o gesto de "abrir o
     * dia" nunca chegava a mostrar o dia.
     */
    it('tocar num dia mostra as refeições daquele dia, sem sair do histórico', async () => {
        const onPickDate = vi.fn()
        const onClose = vi.fn()
        abrir({ onPickDate, onClose })
        const card = await screen.findByRole('button', { name: /Ver as refeições de Sex/i })
        expect(card).toHaveAttribute('aria-expanded', 'false')
        fireEvent.click(card)
        expect(await screen.findByText('Café da manhã')).toBeInTheDocument()
        expect(screen.getByText('Janta')).toBeInTheDocument()
        expect(card).toHaveAttribute('aria-expanded', 'true')
        expect(onPickDate, 'abrir o card não é navegar — o usuário fica no histórico').not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })

    /**
     * "5 ovos cozidos" no título e "5 ovos cozidos" embaixo — foi o que o
     * aparelho mostrou. Quando a refeição tem um item só, o parser repete o
     * nome inteiro, e o card gastava duas linhas para dizer a mesma coisa.
     */
    it('o item não se repete quando é o próprio nome da refeição', async () => {
        refeicoes.data = [
            { id: 'm1', date: '2026-08-14', created_at: '2026-08-14T13:20:00Z', food_name: '5 ovos cozidos', calories: 388, protein: 33, carbs: 3, fat: 28, items: [{ label: '5 ovos cozidos', grams: 250 }] },
            { id: 'm2', date: '2026-08-14', created_at: '2026-08-14T21:05:00Z', food_name: 'Janta', calories: 900, protein: 60, carbs: 90, fat: 30, items: [{ label: '150g arroz', grams: 150 }] },
        ]
        abrir()
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        expect(await screen.findAllByText('5 ovos cozidos')).toHaveLength(1)
        // O item que ACRESCENTA informação continua aparecendo.
        expect(screen.getByText('150g arroz')).toBeInTheDocument()
    })

    /** A hora é BRT: `created_at` é UTC e 21:05Z é 18:05 em São Paulo. */
    it('a hora da refeição sai no fuso do Brasil', async () => {
        abrir()
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        expect(await screen.findByText('10:20')).toBeInTheDocument()
        expect(screen.getByText('18:05')).toBeInTheDocument()
    })

    it('a navegação continua existindo, dentro do card aberto', async () => {
        const onPickDate = vi.fn()
        const onClose = vi.fn()
        abrir({ onPickDate, onClose })
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        fireEvent.click(await screen.findByRole('button', { name: /abrir o dia para editar/i }))
        // Sem refeição escolhida: quem decide qual editar é a aba (a mais recente).
        expect(onPickDate).toHaveBeenCalledWith('2026-08-14', undefined)
        expect(onClose).toHaveBeenCalled()
    })

    /**
     * Tocar na REFEIÇÃO leva direto ao editor DELA. Abrir o dia e caçar a linha
     * de novo é justamente o passo que o histórico existe para poupar — e com
     * 5 refeições o botão do dia teria que adivinhar qual.
     */
    it('tocar numa refeição manda editar AQUELA', async () => {
        const onPickDate = vi.fn()
        const onClose = vi.fn()
        abrir({ onPickDate, onClose })
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        fireEvent.click(await screen.findByRole('button', { name: /Editar Janta/i }))
        expect(onPickDate).toHaveBeenCalledWith('2026-08-14', 'm2')
        expect(onClose).toHaveBeenCalled()
    })

    /**
     * O card só existe porque houve lançamento. Zero refeições aqui é
     * divergência (refeição apagada em outro aparelho) — dizer "nenhuma
     * refeição" sem mais nada mandaria o usuário caçar um fantasma.
     */
    it('lista vazia no detalhe é tratada como divergência, não como dia vazio', async () => {
        refeicoes.data = []
        abrir()
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        expect(await screen.findByText(/editado em outro aparelho/i)).toBeInTheDocument()
    })

    it('falha de leitura não vira "não comeu nada"', async () => {
        refeicoes.error = { message: 'boom' }
        refeicoes.data = []
        abrir()
        fireEvent.click(await screen.findByRole('button', { name: /Ver as refeições de Sex/i }))
        expect(await screen.findByText(/não consegui carregar as refeições/i)).toBeInTheDocument()
    })

    it('a média é a dos dias registrados, e a cobertura fica visível', async () => {
        abrir()
        // (2400 + 2000) / 2 dias registrados = 2200 — nunca dividido por 30.
        expect(await screen.findByText('2200')).toBeInTheDocument()
        expect(screen.getByText(/2 de 30 dias com lançamento/i)).toBeInTheDocument()
    })

    it('janela vazia diz que não há registro — sem inventar média', async () => {
        resposta.data = []
        abrir()
        expect(await screen.findByText(/nenhum dia registrado/i)).toBeInTheDocument()
        expect(screen.getByText(/0 de 30 dias com lançamento/i)).toBeInTheDocument()
    })

    /**
     * O supabase-js devolve a falha no RETORNO. Sem o ramo de erro, uma leitura
     * que falhou desenharia o mesmo estado vazio — a lista afirmaria que o
     * usuário nunca comeu.
     */
    it('erro de leitura NÃO vira "nunca comeu"', async () => {
        resposta.data = []
        resposta.error = { message: 'boom' }
        abrir()
        expect(await screen.findByText(/não consegui carregar/i)).toBeInTheDocument()
        expect(screen.queryByText(/nenhum dia registrado/i)).not.toBeInTheDocument()
    })

    /**
     * Visto no aparelho: a linha lia "Sex., 14 De Ago." — o `capitalize` do
     * Tailwind sobe TODA palavra, e o navegador de data logo acima escreve
     * "sex., 14 de ago.". Duas grafias da mesma data na mesma tela.
     */
    it('a data sobe só a primeira letra — "De Ago." não existe', async () => {
        abrir()
        const linha = await screen.findByText(/14 de ago/i)
        expect(linha.textContent).not.toMatch(/\sDe\s/)
        expect(linha.className, 'capitalize do Tailwind sobe toda palavra').not.toMatch(/capitalize/)
    })

    it('fechada, não renderiza nada', () => {
        const { container } = abrir({ open: false })
        expect(container.textContent).toBe('')
    })
})

/**
 * Compartilhar o PERÍODO — o passo 2 do histórico. O composer é o mesmo dos
 * modos refeição e dia (5 templates), só muda o conteúdo desenhado.
 */
describe('story do período', () => {
    it('o botão nomeia o período da janela', async () => {
        abrir()
        expect(await screen.findByRole('button', { name: /compartilhar mês/i })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /^7 dias$/i }))
        expect(await screen.findByRole('button', { name: /compartilhar semana/i })).toBeInTheDocument()
    })

    it('janela sem lançamento não deixa postar — média de nada é afirmação falsa', async () => {
        resposta.data = []
        abrir()
        const botao = await screen.findByRole('button', { name: /compartilhar/i })
        expect(botao).toBeDisabled()
    })

    /**
     * ⚠️ `findByRole` + assert imediato NÃO serve aqui: o botão existe desde o
     * primeiro render, DESABILITADO (`loggedDays === 0` enquanto a consulta não
     * volta). O teste media um estado transitório e passava por sorte — quebrou
     * no CI, que é mais lento, com o código correto. O que se espera é a
     * TRANSIÇÃO, então quem espera é o `waitFor`.
     */
    it('com dias registrados, o botão libera', async () => {
        abrir()
        const botao = await screen.findByRole('button', { name: /compartilhar/i })
        await waitFor(() => expect(botao).not.toBeDisabled())
    })

    it('o composer recebe o resumo JÁ calculado, sem refazer a média', () => {
        const modal = readFileSync(join(__dirname, '..', 'NutritionHistoryModal.tsx'), 'utf8')
        expect(modal, 'duas contas para a mesma média é como nasce divergência')
            .toMatch(/periodToContent\(resumo,/)
        expect(modal).toMatch(/mode="period"/)
    })
})

/**
 * O MESMO MOLDE do histórico de treino (25/08/2026, pedido do dono).
 *
 * As duas telas respondem a mesma pergunta — "como foi o meu período?" — e
 * chegavam a ela por caminhos visuais diferentes. Aqui ficam os casos que
 * provam a paridade pela TELA; a que impede uma terceira cópia de nascer está
 * em `components/history/__tests__/historicoMesmoMolde.test.ts`.
 */
describe('mesmo molde do histórico de treino', () => {
    it('o resumo traz a média de CADA macro, não só a proteína', async () => {
        abrir()
        // Média de 2 dias: (900+1500+2000)/2 = 2200 kcal · P 165 · C 225 · G 65.
        expect(await screen.findByText('2200')).toBeInTheDocument()
        for (const [rotulo, media] of [['Proteína', '165'], ['Carbo', '225'], ['Gordura', '65']]) {
            const bloco = screen.getByText(rotulo).closest('.rounded-xl')
            expect(bloco?.textContent, `o bloco ${rotulo} precisa mostrar a média`).toContain(media)
        }
    })

    /**
     * A semana do app é domingo→sábado, BRT — e a fixture foi escolhida para
     * distinguir: 16/08 é DOMINGO e 14/08 é sexta. Com o cálculo antigo (a
     * partir da segunda, como o histórico de treino fazia) os dois cairiam na
     * mesma semana e existiria UM cabeçalho só.
     */
    it('os dias vêm agrupados por semana, e o domingo ABRE a semana', async () => {
        abrir()
        expect(await screen.findByText('Semana de 16/08')).toBeInTheDocument()
        expect(screen.getByText('Semana de 09/08')).toBeInTheDocument()
    })

    it('a pílula abrevia na tela e anuncia por extenso', async () => {
        abrir()
        const pilula = await screen.findByRole('button', { name: /^7 dias$/i })
        expect(pilula.textContent, 'quatro janelas + período precisam caber em 375pt').toBe('7d')
    })

    /**
     * O dia fora da média some por HIERARQUIA (accent cinza + badge), nunca por
     * opacidade: `opacity-45` levava o texto para 45% do contraste e o dado
     * continua sendo dado da pessoa.
     */
    it('dia fora da média não é apagado por opacidade', async () => {
        abrir()
        const linha = await screen.findByRole('button', { name: /refeições de Hoje/i })
        expect(linha.className).not.toMatch(/opacity-/)
    })
})

describe('fiação na aba de nutrição', () => {
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

    it('o navegador de data abre o histórico', () => {
        const mixer = read('NutritionMixer.tsx')
        expect(mixer).toMatch(/onOpenHistory=\{/)
        expect(mixer, 'sem o modal montado o botão não leva a lugar nenhum')
            .toMatch(/<NutritionHistoryModal/)
    })

    /**
     * "Abrir o dia para editar" precisa CHEGAR na lista de lançamentos — a
     * única superfície onde se edita ou apaga uma refeição. Trocar a data
     * sozinho deixa o usuário no topo da aba, e escolhendo HOJE (o caso comum)
     * a tela não muda nada: "clico e ele só abre a aba de nutrição"
     * (relatado no iPhone, 25/08/2026).
     */
    it('tocar num dia da lista muda o dia da aba E leva aos lançamentos', () => {
        const mixer = read('NutritionMixer.tsx')
        const bloco = mixer.slice(mixer.indexOf('<NutritionHistoryModal'), mixer.indexOf('<NutritionHistoryModal') + 300)
        expect(bloco, 'a lista existe para navegar — sem isto ela é só leitura')
            .toMatch(/onPickDate=\{handlePickFromHistory\}/)
        // O handler faz as DUAS coisas; só trocar a data é o bug de origem.
        const handler = mixer.slice(mixer.indexOf('const handlePickFromHistory'), mixer.indexOf('const handlePickFromHistory') + 260)
        expect(handler).toMatch(/handleDateChange\(d\)/)
        expect(handler).toMatch(/setLevarAosLancamentos/)
        expect(mixer, 'sem a âncora não há para onde rolar').toMatch(/ref=\{entriesAnchorRef\}/)
        expect(mixer).toMatch(/entriesAnchorRef\.current\?\.scrollIntoView/)
    })

    /**
     * "Abrir o dia para editar" precisa chegar NO EDITOR, não na lista
     * colapsada (pedido do dono, 25/08/2026, apontando este botão). O editor
     * só pode abrir DEPOIS que os lançamentos do dia chegam do servidor — no
     * instante do toque a lista ainda é a do dia anterior.
     */
    it('o pedido de edição espera os lançamentos do dia carregarem', () => {
        const mixer = read('NutritionMixer.tsx')
        const handler = mixer.slice(mixer.indexOf('const handlePickFromHistory'), mixer.indexOf('const handlePickFromHistory') + 320)
        expect(handler, 'a refeição tocada viaja junto').toMatch(/mealId\?: string/)
        expect(handler).toMatch(/setEditarAoCarregar/)
        // O efeito é quem atende, quando `entries` chega.
        const efeito = mixer.slice(mixer.indexOf('if (!editarAoCarregar) return'), mixer.indexOf('if (!editarAoCarregar) return') + 700)
        expect(efeito, 'sem lançamento não há o que editar — e o pedido não pode disparar no vazio')
            .toMatch(/lista\.length === 0/)
        expect(efeito, 'com id, a refeição tocada; sem id, a mais recente').toMatch(/lista\.find\(/)
        expect(efeito).toMatch(/:\s*lista\[0\]/)
        expect(efeito).toMatch(/abrirEditorDaEntry\(alvo\)/)
    })

    it('abrir o editor expande o card E semeia o rascunho', () => {
        const mixer = read('NutritionMixer.tsx')
        const fn = mixer.slice(mixer.indexOf('const abrirEditorDaEntry'), mixer.indexOf('const abrirEditorDaEntry') + 1300)
        // Sem expandir, o editor abriria dentro de um card fechado.
        expect(fn).toMatch(/setExpandedEntryId\(entry\.id\)/)
        expect(fn).toMatch(/setEditingEntryId\(entry\.id\)/)
        expect(fn, 'sem rascunho o editor abre vazio e salvar apagaria a refeição').toMatch(/setEditDraft\(/)
    })

    /**
     * As SETAS do navegador de data continuam sem rolar: ali o usuário está
     * passeando pelos dias e olhando o resumo do topo — arrastar a tela a cada
     * toque seria sequestrar o gesto dele.
     */
    it('as setas de dia NÃO arrastam a tela', () => {
        const mixer = read('NutritionMixer.tsx')
        const nav = mixer.slice(mixer.indexOf('<DateNavigator'), mixer.indexOf('<DateNavigator') + 220)
        expect(nav).toMatch(/onDateChange=\{handleDateChange\}/)
        expect(nav).not.toMatch(/handlePickFromHistory/)
    })

    it('a meta chega ao story do período', () => {
        const mixer = readFileSync(join(__dirname, '..', 'NutritionMixer.tsx'), 'utf8')
        const bloco = mixer.slice(mixer.indexOf('<NutritionHistoryModal'), mixer.indexOf('<NutritionHistoryModal') + 400)
        expect(bloco, 'sem a meta o story do período perde a referência do hero')
            .toMatch(/goals=\{safeGoals\}/)
    })

    it('o botão de histórico tem nome acessível', () => {
        const nav = read('DateNavigator.tsx')
        expect(nav).toMatch(/aria-label="Histórico de nutrição"/)
    })
})
