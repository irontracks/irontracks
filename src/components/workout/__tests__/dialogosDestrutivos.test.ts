import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Diálogos que apagam trabalho do usuário — auditoria de design, ago/2026.
 *
 * O diálogo de cancelar treino era, literalmente:
 *
 *     título:  "Cancelar"
 *     texto:   "Cancelar treino em andamento? (não salva no histórico)"
 *     botões:  [ Cancelar ]  [ Confirmar ]
 *
 * A mesma palavra significava abandonar o treino (título) e desistir de
 * abandonar (botão). Pior: "Confirmar" — a opção que APAGA a sessão — usava o
 * gold, a cor que o app reserva para ação positiva. Quem está no meio de uma
 * série, com pressa, tinha chance real de perder o treino inteiro.
 *
 * Estes guards travam as duas metades do conserto: o rótulo diz o que o botão
 * FAZ, e o botão destrutivo não usa a cor de ação positiva.
 */

const SRC = join(__dirname, '..', '..', '..')
const footer = readFileSync(join(SRC, 'components', 'workout', 'WorkoutFooter.tsx'), 'utf8')
const dialogo = readFileSync(join(SRC, 'components', 'GlobalDialog.tsx'), 'utf8')
const contexto = readFileSync(join(SRC, 'contexts', 'DialogContext.tsx'), 'utf8')

describe('descartar treino — rótulos', () => {
    it('nenhum botão do diálogo se chama "Cancelar"', () => {
        const chamada = footer.slice(footer.indexOf('const ok = await confirm('), footer.indexOf('if (!ok)'))
        expect(chamada).toContain("confirmText: 'Descartar'")
        expect(chamada, 'rótulo "Cancelar" num diálogo sobre cancelar é ambíguo')
            .not.toMatch(/confirmText:\s*'Cancelar'|cancelText:\s*'Cancelar'/)
    })

    it('o botão de recusa diz o que acontece ao recusar', () => {
        const chamada = footer.slice(footer.indexOf('const ok = await confirm('), footer.indexOf('if (!ok)'))
        expect(chamada).toContain("cancelText: 'Continuar treinando'")
    })

    it('está marcado como destrutivo', () => {
        const chamada = footer.slice(footer.indexOf('const ok = await confirm('), footer.indexOf('if (!ok)'))
        expect(chamada).toContain('destructive: true')
    })

    it('o texto avisa que é irreversível', () => {
        expect(footer).toMatch(/não pode ser desfeito/i)
    })
})

describe('diálogo destrutivo — cor', () => {
    it('o contexto repassa a marcação de destrutivo', () => {
        expect(contexto).toContain('destructive?: boolean')
        expect(contexto).toContain('destructive: opts.destructive === true')
    })

    it('destrutivo pinta o botão de vermelho, não de gold', () => {
        const ramo = dialogo.slice(dialogo.indexOf('if (dialog.destructive)'), dialogo.indexOf("return {\n\t\t\t\t\tbg: 'bg-yellow-500/15"))
        expect(ramo).toContain('bg-red-500')
        expect(ramo, 'gold é a cor de ação positiva — não pode ficar no botão que apaga')
            .not.toContain('bg-yellow-500 hover')
    })
})

describe('iniciar treino — sem pedágio', () => {
    const crud = readFileSync(join(SRC, 'hooks', 'useWorkoutCrud.ts'), 'utf8')

    it('não pede confirmação para COMEÇAR (ação reversível)', () => {
        expect(crud, 'confirmar o início custava um toque no caminho crítico')
            .not.toMatch(/confirm\(\s*`Iniciar "/)
        expect(crud).not.toContain("'Iniciar Treino'")
    })

    it('mas CONTINUA perguntando ao trocar de treino em andamento (há trabalho a perder)', () => {
        expect(crud).toContain("'Trocar de treino?'")
    })
})
