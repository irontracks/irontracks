import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Exceção de ESLint que aponta para arquivo APAGADO é papel de parede com
 * aparência de decisão.
 *
 * Medido na auditoria de 10/09/2026: a config listava três arquivos que não
 * existem mais — `CoachChatModal.tsx` saiu no PR #423 ("remove 39 arquivos
 * órfãos"), junto com `VoiceInput.tsx` e `GymPresenceCard.tsx`. As exceções
 * ficaram para trás e ninguém viu, porque o ESLint simplesmente ignora um
 * `files:` que não casa com nada: nenhum erro, nenhum aviso.
 *
 * O custo não é a linha morta — é que a lista deixa de ser lida. Quando toda
 * exceção tem dono e arquivo vivo, revisar a lista volta a fazer sentido.
 */
describe('a allowlist do ESLint não guarda fantasma', () => {
    const raiz = join(__dirname, '..', '..')
    const config = readFileSync(join(raiz, 'eslint.config.mjs'), 'utf8')

    // Só caminhos concretos: padrões com curinga (`**`, `*`) são regra, não exceção
    // de arquivo, e não têm como ser conferidos por existência.
    const caminhos = [...config.matchAll(/"(src\/[^"*]+\.(?:ts|tsx))"/g)].map((m) => m[1])

    it('todo arquivo citado nominalmente existe', () => {
        expect(caminhos.length, 'nenhum caminho encontrado — o parser quebrou').toBeGreaterThan(0)
        const fantasmas = caminhos.filter((p) => !existsSync(join(raiz, p)))
        expect(fantasmas, `exceção apontando para arquivo apagado:\n  ${fantasmas.join('\n  ')}`).toEqual([])
    })
})
