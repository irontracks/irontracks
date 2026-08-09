import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Um sistema de ícones só — sprint 3 da auditoria de design, ago/2026.
 *
 * Conviviam lucide (vetorial, herda currentColor, alinha com a paleta gold) e
 * emoji cravado no JSX (🗺️ nos títulos, 🤖📊🍽️📅 nas pills do VIP). Emoji
 * renderiza diferente em cada OS, traz cor própria que briga com a marca, e não
 * escala com o texto. Numa tela premium, denuncia o improviso.
 *
 * Emoji continua legítimo onde é CONTEÚDO — seletor do chat, reações de story,
 * escalas de humor do check-in. O que não pode é emoji fazendo papel de ícone
 * de interface.
 */

const SRC = join(__dirname, '..', '..', '..')

/** Emoji usado como ÍCONE de UI nos arquivos que a auditoria varreu. */
const ARQUIVOS = [
    join(SRC, 'components', 'VipHub.tsx'),
    join(SRC, 'components', 'vip', 'WorkoutHeatMap.tsx'),
]

describe('ícones de interface', () => {
    it.each(ARQUIVOS)('%s não usa emoji como ícone', (arquivo) => {
        const src = readFileSync(arquivo, 'utf8')
        // Faixas de pictogramas/emoticons — não pega acento nem símbolo comum.
        const emojis = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []
        expect(emojis, `emoji encontrado: ${emojis.join(' ')}`).toEqual([])
    })

    it('o mapa de treinos usa lucide com alias (Map nativo é sombreado)', () => {
        const src = readFileSync(ARQUIVOS[1], 'utf8')
        expect(src).toMatch(/import \{ Map as MapIcon(, [A-Za-z]+)* \} from 'lucide-react'/)
        expect(src).toContain('<MapIcon')
        // O alias não é preciosismo: `import { Map }` quebrou o `new Map()` do
        // próprio arquivo, com erro de build.
        expect(src).toContain('new Map')
    })

    it('as pills do VIP viraram componente com ícone + rótulo', () => {
        const src = readFileSync(ARQUIVOS[0], 'utf8')
        expect(src).toContain('Icone: Bot')
        expect(src).toContain('Icone: CalendarRange')
    })
})

describe('estado vazio dos stories', () => {
    const src = readFileSync(join(SRC, 'components', 'dashboard', 'StoriesBar.tsx'), 'utf8')

    it('tem ação, não só uma frase', () => {
        expect(src).toContain('Publicar story')
        expect(src).toContain('setIsCreatorOpen(true)')
    })

    it('não ensina mais um gesto invisível', () => {
        expect(src, 'instruir "segure o avatar" é a pior affordance: não se vê')
            .not.toContain('Segure seu avatar')
    })
})
