import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeDelta, daysBetween } from '../assessmentDelta'

/**
 * Redesign do histórico de avaliações (ago/2026, pedido do dono: "muito
 * amador"). O defeito não era só acabamento: o card mostrava cinco números do
 * mesmo tamanho e NENHUMA evolução — 88,2 kg virando 92,5 estava na tela e
 * ninguém via, porque exigia rolar e fazer a conta de cabeça.
 */
describe('computeDelta', () => {
    it('calcula a variação com sinal tipográfico', () => {
        expect(computeDelta(92.5, 88.2, null)).toMatchObject({ diff: 4.3, label: '+4.3' })
        // menos tipográfico (−), não hífen: alinha melhor e não vira quebra de linha
        expect(computeDelta(11.3, 12.2, 'down')?.label).toBe('−0.9')
    })

    it('gordura caindo é BOM, subindo é ruim', () => {
        expect(computeDelta(11.3, 12.2, 'down')?.tone).toBe('good')
        expect(computeDelta(13.0, 12.2, 'down')?.tone).toBe('bad')
    })

    it('massa magra subindo é BOM, caindo é ruim', () => {
        expect(computeDelta(82.1, 77.4, 'up')?.tone).toBe('good')
        expect(computeDelta(75.0, 77.4, 'up')?.tone).toBe('bad')
    })

    it('PESO nunca é julgado — o app não sabe o objetivo de quem olha', () => {
        // Subir é ganho em bulking e problema em corte. Pintar de vermelho seria
        // opinião disfarçada de dado.
        expect(computeDelta(92.5, 88.2, null)?.tone).toBe('neutral')
        expect(computeDelta(84.0, 88.2, null)?.tone).toBe('neutral')
    })

    it('variação que arredonda para zero não vira seta', () => {
        // "+0.0" com seta verde é ruído com cara de sinal.
        expect(computeDelta(88.24, 88.2, null)).toBeNull()
        expect(computeDelta(88.2, 88.2, null)).toBeNull()
    })

    it('sem avaliação anterior não inventa variação', () => {
        expect(computeDelta(88.2, null, null)).toBeNull()
        expect(computeDelta(88.2, undefined, 'down')).toBeNull()
        expect(computeDelta(null, 88.2, 'up')).toBeNull()
        expect(computeDelta(NaN, 88.2, null)).toBeNull()
    })
})

describe('daysBetween', () => {
    it('dá escala à variação (+4.3 kg em 30 dias ≠ em 300)', () => {
        expect(daysBetween('2024-09-18', '2024-03-14')).toBe(188)
    })

    it('ignora ordem invertida e datas inválidas', () => {
        expect(daysBetween('2024-03-14', '2024-09-18')).toBeNull()
        expect(daysBetween('ontem', '2024-03-14')).toBeNull()
        expect(daysBetween(null, undefined)).toBeNull()
    })
})

describe('lista do histórico', () => {
    const HIST = readFileSync('src/components/assessment/AssessmentHistory.tsx', 'utf8')
    const ITEM = readFileSync('src/components/assessment/AssessmentListItem.tsx', 'utf8')

    it('mostra a avaliação MAIS RECENTE primeiro', () => {
        // Pedido do dono: "as últimas precisam estar por primeiro, não lá no final".
        expect(HIST).toMatch(/\[\.\.\.sortedAssessments\]\.reverse\(\)\.map/)
    })

    it('NÃO inverte a fonte dos gráficos — eles são linha do tempo', () => {
        // `buildAssessmentChartData` monta os labels na ordem e faz slice(-N) das
        // mais recentes: inverter ali desenharia o gráfico ao contrário.
        expect(HIST).toMatch(/assessments=\{sortedAssessments\}/)
        expect(HIST).not.toMatch(/sortedAssessments\.reverse\(\)/) // reverse sem cópia mutaria o array
    })

    it('compara com a anterior no TEMPO, não com a linha de baixo', () => {
        // Com a lista invertida, a vizinha visual é a anterior — mas depender
        // disso quebraria em qualquer mudança de ordenação.
        expect(HIST).toMatch(/const idx = sortedAssessments\.length - 1 - revIdx/)
        expect(HIST).toMatch(/sortedAssessments\[idx - 1\]/)
    })

    it('o card destaca peso e gordura e mostra a variação', () => {
        expect(ITEM).toMatch(/computeDelta\(peso,/)
        expect(ITEM).toMatch(/computeDelta\(bf,[\s\S]{0,90}'down'\)/)
        expect(ITEM).toMatch(/computeDelta\(lean,[\s\S]{0,90}'up'\)/)
        // peso sem julgamento de cor
        expect(ITEM).toMatch(/computeDelta\(peso,[\s\S]{0,90}, null\)/)
    })

    it('não sobrou a grade antiga que deixava o TDEE órfão', () => {
        // 5 itens em 2 colunas = 2+2+1, com o último card sozinho e torto.
        expect(ITEM).not.toMatch(/grid-cols-2 md:grid-cols-5/)
    })
})

/**
 * Barra de ações (ago/2026, "não estou gostando dos botões").
 *
 * O que havia: cinco ações em duas linhas, com DOIS botões amarelos
 * competindo — Gerar PDF e Plano IA. Quando tudo é primário, nada é. E a
 * lixeira vermelha ficava em destaque permanente para uma ação rara.
 */
describe('barra de ações do card', () => {
    const ITEM = readFileSync('src/components/assessment/AssessmentListItem.tsx', 'utf8')
    const PDF = readFileSync('src/components/assessment/AssessmentPDFGenerator.tsx', 'utf8')

    it('só UMA ação em destaque dourado — o Plano IA', () => {
        // Se o PDF voltar a ser amarelo, voltam os dois primários brigando.
        const acoes = ITEM.slice(ITEM.indexOf('Barra de ações'))
        const dourados = acoes.match(/from-yellow-400|bg-yellow-500/g) || []
        expect(dourados.length).toBe(1)
        expect(acoes).toMatch(/from-yellow-400 to-amber-500[\s\S]{0,400}Plano IA/)
    })

    it('as ações cabem em UMA linha', () => {
        // O contêiner antigo era `flex-col` com duas `Row`.
        expect(ITEM).toMatch(/mt-3 flex items-center gap-2/)
        expect(ITEM).not.toMatch(/\{\/\* Row 2: AI \+ Edit \+ Delete/)
    })

    it('secundárias são ícone, mas continuam acessíveis', () => {
        // Ícone sem rótulo acessível é armadilha para leitor de tela.
        expect(ITEM).toMatch(/aria-label="Editar avaliação"/)
        expect(ITEM).toMatch(/aria-label="Excluir avaliação"/)
        expect(PDF).toMatch(/aria-label="Gerar PDF da avaliação"/)
    })

    it('excluir mantém confirmação inline (nunca apaga em um toque)', () => {
        expect(ITEM).toMatch(/confirmDeleteId === assessmentId \?/)
        expect(ITEM).toMatch(/onConfirmDelete\(null\)/)
    })

    it('o PDF ganhou variante de ícone sem perder a primária', () => {
        expect(PDF).toMatch(/variant\?: 'primary' \| 'icon'/)
        expect(PDF).toMatch(/if \(variant === 'icon'\)/)
        // a versão com rótulo segue existindo para outros usos
        expect(PDF).toMatch(/Gerando…' : 'Gerar PDF'/)
    })

    it('o PDF continua recebendo o treinador da avaliação', () => {
        // Regressão real cometida durante este redesign: o nome virou uma string
        // fixa ("IronTracks") e teria ido parar no PDF de todo mundo.
        expect(ITEM).toMatch(/trainerName=\{String\(assessment\.trainer_name \?\? ''\)\}/)
        expect(ITEM).not.toMatch(/trainerName="IronTracks"/)
    })
})
