import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O Diário de Progresso saiu de Configurações para as Avaliações.
 *
 * Medido em 30/08/2026: a tabela `photos` estava **vazia** — a feature existe,
 * funciona (comparador before/after deslizável) e nunca foi usada por ninguém.
 * Enquanto isso, **15 pessoas registram peso no check-in, 805 vezes**.
 *
 * O interesse por acompanhar evolução existe; o lugar é que estava errado. Ela
 * morava em *Configurações › Ferramentas*, ao lado de "Novidades" — e evolução
 * corporal se procura na aba de avaliações, ao lado do peso e da gordura.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const AVALIACOES = semComentarios(ler('src/components/assessment/AssessmentHistory.tsx'))

describe('o Diário está onde se procura evolução', () => {
    it('existe na tela de avaliações', () => {
        expect(AVALIACOES).toContain('Diário de Progresso')
        expect(AVALIACOES).toMatch(/setShowProgressPhotos\(true\)/)
    })

    it('aparece TAMBÉM para quem não tem avaliação nenhuma', () => {
        // A primeira versão pôs o card só no bloco de gráficos, que roda
        // DEPOIS do early return do estado vazio — e apenas 2 dos 59 usuários
        // têm avaliação. O card saiu de um lugar escondido para outro, e foi a
        // conferência no aparelho que mostrou.
        const usos = [...AVALIACOES.matchAll(/<DiarioDeProgressoCard/g)]
        expect(usos.length, 'o card precisa dos DOIS ramos: com e sem avaliação').toBeGreaterThanOrEqual(2)
        const vazio = AVALIACOES.indexOf('assessments.length === 0')
        const primeiro = AVALIACOES.indexOf('<DiarioDeProgressoCard')
        expect(vazio).toBeGreaterThan(-1)
        expect(primeiro, 'um dos usos tem que estar no ramo do estado vazio').toBeGreaterThan(vazio)
    })

    it('fica junto do peso e da gordura, não solto no fim', () => {
        // A vizinhança é o argumento: quem olha a tendência de peso é quem
        // quer ver a foto de três meses atrás.
        const peso = AVALIACOES.indexOf('<WeightTrendCard')
        const diario = AVALIACOES.indexOf('<DiarioDeProgressoCard', peso)
        const gordura = AVALIACOES.indexOf('Gordura Corporal')
        expect(peso).toBeGreaterThan(-1)
        expect(diario).toBeGreaterThan(peso)
        expect(diario).toBeLessThan(gordura)
    })

    it('pede a abertura pelo store, sem montar um segundo modal', () => {
        // O `ProgressPhotos` é montado uma vez no shell (`DashboardModals`).
        // Montar outro aqui daria duas instâncias do mesmo diário.
        expect(AVALIACOES).not.toMatch(/<ProgressPhotos/)
        expect(AVALIACOES).toMatch(/useModalStore\(\(st\) => st\.setShowProgressPhotos\)/)
    })

    it('continua alcançável por Configurações — mover não é esconder', () => {
        // Quem já conhecia o caminho antigo não perde o acesso.
        const CONFIG = semComentarios(ler('src/components/settings/SettingsSections.tsx'))
        expect(CONFIG).toMatch(/onOpenProgressPhotos/)
    })
})
