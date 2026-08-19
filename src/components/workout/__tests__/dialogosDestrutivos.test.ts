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
/**
 * ⚠️ O gatilho já mudou de casa DUAS vezes e o arquivo é o mesmo desde 18/08:
 * saiu do rodapé (X mudo colado no "Finalizar") para o menu "…" do cabeçalho e,
 * em 19/08/2026, virou um X próprio no cabeçalho — dentro do menu o dono não o
 * encontrava ("estamos sem o botão de encerrar sem salvar"). Os invariantes do
 * DIÁLOGO são os mesmos nas três casas; o que mudou é só quem o dispara.
 */
const footer = readFileSync(join(SRC, 'components', 'workout', 'WorkoutHeader.tsx'), 'utf8')
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

describe('descartar treino — onde mora o gatilho', () => {
    it('é alcançável sem abrir menu nenhum', () => {
        expect(footer).toContain('aria-label="Descartar treino"')
    })

    it('não é item de menu (item de menu fecha o dropdown ao disparar)', () => {
        // O que distingue um item do "…" de um botão do cabeçalho é o
        // `setOverflowOpen(false)` no mesmo handler. Se ele voltar a aparecer
        // junto do descarte, o botão voltou para dentro do menu.
        const chamadas = footer.match(/onClick=\{[^}]*descartarTreino\(\)[^}]*\}/g) ?? []
        expect(chamadas).toHaveLength(1)
        expect(chamadas[0]).not.toContain('setOverflowOpen')
    })

    it('o X não usa a cor da ação positiva', () => {
        const botao = footer.slice(footer.indexOf('aria-label="Descartar treino"'))
            .slice(0, footer.slice(footer.indexOf('aria-label="Descartar treino"')).indexOf('</button>'))
        expect(botao).toMatch(/text-red-/)
        expect(botao, 'gold é a cor de quem AVANÇA o treino, não de quem o joga fora')
            .not.toMatch(/text-yellow-|bg-yellow-500\b/)
    })
})
