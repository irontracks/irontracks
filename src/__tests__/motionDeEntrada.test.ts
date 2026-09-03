import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Auditoria de motion, 03/09/2026: 84 dos 93 overlays full-screen do app
 * entravam e saíam por corte seco. O achado NÃO foi falta de sistema — as
 * classes existiam no `globals.css` e tinham dois usuários cada. Era falta de
 * adoção.
 *
 * A correção alcança os modais por ESTRUTURA (`role="dialog"` + `aria-modal`,
 * que `dialogProps()` já injeta desde o PR #779) em vez de marcar 84 arquivos
 * à mão — uma varredura por regex já colapsou 73 arquivos JSX neste repo.
 *
 * Estes casos travam o que não pode voltar a se perder.
 */

const SRC = join(__dirname, '..')
const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8')

describe('entrada de modal vem da estrutura, não de classe por arquivo', () => {
    it('as três regras existem e miram em role+aria-modal', () => {
        // B: o próprio overlay é o diálogo → só esmaece
        expect(css).toMatch(/\.fixed\[role='dialog'\]\[aria-modal='true'\]\s*\{[^}]*animation:\s*fadeIn/)
        // A: painel hospedado → sobe
        expect(css).toMatch(/\.fixed \[role='dialog'\]\[aria-modal='true'\]:not\(\.fixed\)\s*\{[^}]*animation:\s*overlay-panel-in/)
        // o véu que hospeda
        expect(css).toMatch(/:has\(\[role='dialog'\]\[aria-modal='true'\]\)\s*\{[^}]*animation:\s*fadeIn/)
        expect(css).toMatch(/@keyframes overlay-panel-in/)
    })

    /**
     * O véu não pode pegar QUALQUER `.fixed`. Sem o `:has()`, a regra alcançaria
     * barras fixas, o rodapé do treino e a barra do descanso — que não são
     * janelas e piscariam a cada montagem.
     */
    it('o véu exige hospedar um diálogo — não pega .fixed genérico', () => {
        const regra = css.match(/\.fixed:not\(\[role='dialog'\]\):has\([^)]*\)\s*\{[^}]*\}/)?.[0] ?? ''
        expect(regra, 'a regra do véu precisa existir').not.toBe('')
        expect(regra).toContain(':has(')
        expect(regra).toContain("[aria-modal='true']")
    })

    /**
     * A cobertura depende de as janelas terem semântica. O ratchet de a11y já
     * garante isso hoje (`JANELA_PENDENTE` vazio) — este caso amarra os dois:
     * se alguém voltar a criar janela sem `dialogProps`, ela perde o motion
     * junto com a acessibilidade, e em silêncio.
     */
    it('toda janela de verdade continua declarando a semântica que a regra usa', () => {
        const ratchet = readFileSync(join(SRC, '__tests__', 'modalDialogRatchet.test.ts'), 'utf8')
        const pendentes = ratchet.match(/JANELA_PENDENTE = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
        const itens = pendentes.split('\n').map((l) => l.trim()).filter((l) => l.startsWith("'"))
        expect(itens, 'janela sem dialogProps não recebe a entrada animada').toEqual([])
    })
})

describe('o vocabulário do design system é usado, não decorativo', () => {
    /**
     * `badge-slam` e `button-slam` foram escritos e ficaram com ZERO usuários
     * até esta auditoria. Keyframe sem consumidor é peso morto que o próximo
     * agente lê como "o app já tem isso" e não tem.
     */
    const usadoEmTsx = (nome: string): number => {
        let n = 0
        const anda = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'node_modules' || e.name === '__tests__') continue
                const p = join(dir, e.name)
                if (e.isDirectory()) anda(p)
                else if (e.name.endsWith('.tsx') && readFileSync(p, 'utf8').includes(nome)) n++
            }
        }
        anda(SRC)
        return n
    }

    it('badge-slam tem consumidor — é o gesto do PR', () => {
        expect(usadoEmTsx('animate-badge-slam')).toBeGreaterThan(0)
    })

    it('a entrada escalonada da lista de treinos existe', () => {
        expect(usadoEmTsx('workout-card-in')).toBeGreaterThan(0)
        expect(css).toMatch(/\.workout-card-in\s*\{[^}]*animation:\s*fadeIn/)
    })

    /**
     * `.expand-enter` existia com UM usuário enquanto 14 disclosures (botão com
     * `aria-expanded` + painel condicional) abriam por corte seco, empurrando o
     * conteúdo abaixo sem o olho ter como acompanhar.
     *
     * Este caso trava a CLASSE, não a contagem: o que não pode voltar é a regra
     * ficar órfã de novo. Os disclosures restantes têm estruturas heterogêneas
     * e pedem edição arquivo a arquivo — dívida conhecida, não esquecimento.
     */
    it('a expansão de painel tem consumidor', () => {
        // RATCHET: só sobe. `toBeGreaterThan(1)` foi a primeira versão e era
        // GUARD FALSO — tirar a classe de um arquivo ainda deixava dois, e o
        // teste passava verde com o defeito reposto (provado por mutação).
        expect(usadoEmTsx('expand-enter')).toBeGreaterThanOrEqual(3)
        expect(css).toMatch(/\.expand-enter\s*\{[^}]*animation:\s*expandIn/)
    })

    it('a tela pós-treino entra em cascata', () => {
        const rel = readFileSync(join(SRC, 'components', 'WorkoutReport.tsx'), 'utf8')
        expect(rel).toMatch(/stagger-children/)
    })
})

describe('count-up é fonte única e respeita movimento reduzido', () => {
    const hook = readFileSync(join(SRC, 'hooks', 'useCountUp.ts'), 'utf8')

    it('o hook consulta prefers-reduced-motion', () => {
        // `requestAnimationFrame` é JS: o reset global do globals.css corta
        // `animation-duration` de CSS e passa longe daqui.
        expect(hook).toMatch(/prefers-reduced-motion: reduce/)
    })

    it('não parte do zero quando o alvo muda', () => {
        // O dado chega do cache e depois da rede neste app; reiniciar em 0
        // faria o número despencar e subir de novo à vista do usuário.
        expect(hook).toMatch(/const partida = de\.current/)
    })

    it('desacelera na chegada em vez de subir linear', () => {
        expect(hook).toMatch(/easeOutCubic|1 - Math\.pow\(1 - t, 3\)/)
    })

    it('não existe uma segunda implementação de count-up solta', () => {
        const copias: string[] = []
        const anda = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'node_modules' || e.name === '__tests__') continue
                const p = join(dir, e.name)
                if (e.isDirectory()) anda(p)
                else if (/\.tsx?$/.test(e.name) && p !== join(SRC, 'hooks', 'useCountUp.ts')) {
                    if (/function useCountUp/.test(readFileSync(p, 'utf8'))) copias.push(p.replace(SRC, ''))
                }
            }
        }
        anda(SRC)
        expect(copias, 'count-up tem que ter uma implementação só').toEqual([])
    })
})
