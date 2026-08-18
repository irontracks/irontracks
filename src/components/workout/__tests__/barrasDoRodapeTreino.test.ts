/**
 * Guard de CLASSE das barras fixas no rodapé do treino ativo.
 *
 * Por que ele existe (15/08/2026): o PR #833 corrigiu "a barra do descanso
 * cobre o botão" nos MODAIS e escreveu um guard — que varria só os três
 * arquivos de modais. O `WorkoutFooter`, que sofre do mesmo defeito pelo mesmo
 * motivo, ficou de fora, e o guard passou verde com o bug vivo: no teste E2E de
 * 10 passos o botão FINALIZAR estava inalcançável durante o descanso.
 *
 * Guard que enumera os arquivos que o autor já conhecia não é guard de classe.
 * Este aqui VARRE o diretório do treino ativo atrás de qualquer elemento fixado
 * no rodapé (`fixed` + `bottom-0`, ou `fixed` com `bottom` via style) e exige
 * que cada um esteja declarado abaixo, dizendo COMO convive com a barra do
 * descanso. Barra nova = vermelho pedindo a decisão, não bug em produção.
 *
 * ⚠️ Sobreposição de rodapé NÃO se resolve com z-index: duas barras disputam o
 * mesmo espaço físico, então quem fica por cima esconde a outra qualquer que
 * seja o z. A convivência é geométrica (uma empurra a outra).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = 'src/components/workout'

/**
 * Cada barra fixa no rodapé do treino ativo e o papel dela na convivência.
 *  - 'publica-altura': mede a própria altura e publica em --it-rest-bar-h.
 *  - 'consome-altura': posiciona o próprio bottom pela variável (sobe).
 * Barra nova precisa de uma decisão explícita aqui — e do código que a cumpra.
 */
const BARRAS: Record<string, 'publica-altura' | 'consome-altura'> = {
    'RestTimerOverlay.tsx': 'publica-altura',
    'WorkoutFooter.tsx': 'consome-altura',
}

const stripComments = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Elemento fixado no rodapé: `fixed` + `bottom-0` na classe, ou `fixed` + bottom no style. */
function temBarraDeRodape(src: string): boolean {
    const code = stripComments(src)
    if (/className=[^\n]*\bfixed\b[^\n]*\bbottom-0\b/.test(code)) return true
    // Caso do WorkoutFooter pós-correção: bottom sai do style (var), não da classe.
    return /style=\{\{[^}]*\bbottom:[^}]*\}\}/.test(code) && /className=[^\n]*\bfixed\b/.test(code)
}

describe('barras fixas no rodapé do treino ativo', () => {
    const arquivos = readdirSync(DIR).filter((f) => f.endsWith('.tsx'))
    const comBarra = arquivos.filter((f) => temBarraDeRodape(readFileSync(path.join(DIR, f), 'utf8')))

    it('autoteste: o detector encontra as barras conhecidas', () => {
        // Se isto falhar, o detector quebrou e o caso de baixo estaria verde
        // por não olhar nada — o 5º jeito de errar do CLAUDE.md.
        expect(comBarra).toEqual(expect.arrayContaining(Object.keys(BARRAS)))
    })

    it('toda barra de rodapé está declarada com seu papel na convivência', () => {
        const naoDeclaradas = comBarra.filter((f) => !(f in BARRAS))
        // Barra nova no rodapé do treino ativo? Decida como ela convive com a
        // barra do descanso (empurra ou é empurrada) e declare em BARRAS.
        // Sem isso ela vai COBRIR ou SER COBERTA por outra — foi assim que o
        // "Finalizar" ficou inalcançável durante o descanso.
        expect(naoDeclaradas).toEqual([])
    })

    it.each(Object.entries(BARRAS))('%s cumpre o papel declarado (%s)', (arquivo, papel) => {
        const src = stripComments(readFileSync(path.join(DIR, arquivo), 'utf8'))
        if (papel === 'publica-altura') {
            expect(src).toMatch(/setProperty\(\s*['"]--it-rest-bar-h['"]/)
            expect(src).toMatch(/removeProperty\(\s*['"]--it-rest-bar-h['"]/)
        } else {
            // `calc(var(...) + Npx)` conta: o respiro entre os dois faz parte
            // do posicionamento. O invariante é consumir a variável.
            expect(src).toMatch(/bottom:\s*['"](?:var\(--it-rest-bar-h,\s*0px\)|calc\(var\(--it-rest-bar-h,\s*0px\)[^'"]*\))['"]/)
        }
    })

    it('nenhuma barra tenta resolver a convivência só com z-index', () => {
        // Registro da lição: subir o z do rodapé (50 → qualquer coisa) não
        // resolvia nada, porque as duas barras ocupam o MESMO espaço. Se
        // alguém tentar de novo, o teste acima (bottom pela variável) é quem
        // segura — este caso existe para o comentário ser lido.
        const footer = stripComments(readFileSync(path.join(DIR, 'WorkoutFooter.tsx'), 'utf8'))
        expect(footer).toMatch(/var\(--it-rest-bar-h/)
    })
})
