import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Retorno tátil ao concluir a série — ago/2026.
 *
 * O bloco de haptic já existia no `updateLog` (o ponto ÚNICO por onde os 14
 * renderers passam ao marcar `done`), e mesmo assim o iPhone não vibrava:
 * usava só `navigator.vibrate`, a Web Vibration API — que o iOS não implementa,
 * nem no Safari nem na WKWebView do Capacitor.
 *
 * Resultado: no aparelho da maior parte da base, a única confirmação de "série
 * concluída" era visual — justo quando o usuário não olha a tela (celular
 * apoiado, fone, descanso começando).
 *
 * O invariante que este guard trava: os DOIS caminhos juntos. O nativo faz o
 * Taptic Engine responder no iOS; o `vibrate` cobre Android e web. Cada um é
 * no-op onde não se aplica, então não há vibração dupla — mas remover qualquer
 * um deixa uma plataforma inteira muda, e mudez não quebra teste nenhum.
 */

const controller = readFileSync(
    join(__dirname, '..', 'useActiveWorkoutController.ts'),
    'utf8',
)

const executavel = controller
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')

/** O trecho que roda quando uma série é marcada como concluída. */
const blocoDone = (() => {
    const i = executavel.indexOf('patchObj.done === true')
    expect(i, 'o ponto único de conclusão sumiu do controller').toBeGreaterThan(-1)
    return executavel.slice(i, i + 900)
})()

describe('haptic ao concluir série', () => {
    it('dispara pelo caminho NATIVO (o único que funciona no iOS)', () => {
        expect(blocoDone, 'sem isto o iPhone fica mudo e nenhum teste reclama')
            .toContain('triggerHaptic')
    })

    it('mantém o caminho web/Android', () => {
        const chamadas = blocoDone.match(/navigator\?\.vibrate/g) || []
        expect(chamadas.length, 'série avulsa e exercício completo, cada um o seu')
            .toBe(2)
    })

    it('série avulsa e exercício completo têm intensidades diferentes', () => {
        // Igualar os dois tira a informação: o usuário deixa de saber, pelo
        // toque, que fechou o exercício inteiro.
        expect(blocoDone).toContain("triggerHaptic('light')")
        expect(blocoDone).toContain("triggerHaptic('medium')")
    })

    it('não bloqueia o registro da série', () => {
        // `await` aqui atrasaria o `updateLog` — a série é o caminho mais
        // quente do app e o haptic é enfeite, não pode entrar na frente.
        expect(blocoDone).not.toMatch(/await\s+triggerHaptic/)
        expect(blocoDone, 'promise rejeitada sem catch vira unhandled rejection')
            .toMatch(/triggerHaptic\([^)]*\)\.catch\(/)
    })

    it('o import existe', () => {
        expect(executavel).toMatch(
            /import \{ triggerHaptic \} from '@\/utils\/native\/irontracksNative'/,
        )
    })
})
