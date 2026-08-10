import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ações de compartilhamento do relatório — ago/2026.
 *
 * O cabeçalho tinha TRÊS botões: Salvar (PDF/JSON), STORY e CARD. O CARD abria
 * o `WorkoutShareCard`, um componente de 419 linhas que renderizava em
 * **1080×1920 — a mesma proporção do Story**, só que sem foto de fundo, sem
 * legenda e sem posicionamento da marca.
 *
 * Ou seja: duas portas para o mesmo formato de imagem, e a segunda fazia menos.
 * O `StoryComposer` cobre o caso inteiro, incluindo exportar sem editar nada.
 *
 * Este guard existe porque "adicionar um botão de compartilhar" é a mudança
 * mais fácil de refazer sem perceber que já existe uma.
 */

const RAIZ = join(__dirname, '..', '..')
const relatorio = readFileSync(join(RAIZ, 'components', 'WorkoutReport.tsx'), 'utf8')

const executavel = relatorio
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')

describe('uma porta só para imagem compartilhável', () => {
    it('o StoryComposer continua sendo o caminho', () => {
        expect(executavel).toContain('StoryComposer')
    })

    it('o WorkoutShareCard não voltou', () => {
        expect(executavel, 'ele renderizava no MESMO 1080x1920 do Story, fazendo menos')
            .not.toContain('WorkoutShareCard')
        expect(
            existsSync(join(RAIZ, 'components', 'WorkoutShareCard.tsx')),
            'o arquivo foi removido junto com o botão',
        ).toBe(false)
    })

    it('não sobrou estado nem handler órfão', () => {
        // Estado que ninguém lê é o rastro típico de remoção pela metade.
        expect(executavel).not.toContain('showShareCard')
    })

    it('as ações que restaram são as três do cabeçalho', () => {
        // Salvar (PDF/JSON) e Story. Fechar não conta como ação de export.
        expect(executavel).toContain('Salvar PDF')
        expect(executavel).toContain('Salvar JSON')
        expect(executavel).toMatch(/>Story</)
    })
})
