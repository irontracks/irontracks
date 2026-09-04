import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Não vou fazer esse hoje" — a fiação.
 *
 * A regra (denominador, série já feita, grupo) é comportamento e está provada
 * em `lib/workout/__tests__/skippedExercises.test.ts`. O que se trava aqui é o
 * meio do caminho, que é onde este repo já se perdeu várias vezes: as duas
 * pontas certas e ninguém ligando uma na outra.
 */
const SRC = join(__dirname, '..', '..', '..')
const controller = readFileSync(join(SRC, 'components/workout/useActiveWorkoutController.ts'), 'utf8')
const card = readFileSync(join(SRC, 'components/workout/ExerciseCard.tsx'), 'utf8')
const modais = readFileSync(join(SRC, 'components/workout/hooks/useWorkoutModals.ts'), 'utf8')

describe('o progresso desconta o dispensado', () => {
    /**
     * O ponto da feature: sem descontar, a barra jamais chega a 100% e o app
     * cobra para sempre um trabalho que o usuário decidiu não fazer.
     *
     * ⚠️ Guard de FORMA, e a limitação é declarada: a conta é inline no
     * controller porque passar dado derivado do ref dos logs para qualquer
     * função de fora dispara `react-hooks/refs` no arquivo inteiro (15 erros,
     * medido por eliminação — chamada externa com dado FIXO passa limpa). Não
     * dá para isolar a regra num módulo puro e testá-la por comportamento sem
     * montar o treino ativo inteiro.
     */
    const blocoDoProgresso = (() => {
        const i = controller.indexOf('const { completedSets, totalSets, progressPct, remainingSets }')
        return i > -1 ? controller.slice(i, controller.indexOf('}, [exercises, logs, skippedExercises]);', i)) : ''
    })()

    it('a contagem consulta os dispensados', () => {
        expect(blocoDoProgresso, 'o bloco do progresso sumiu').not.toBe('')
        expect(blocoDoProgresso).toMatch(/skippedExercises\.has\(exIdx\)/)
    })

    it('série FEITA conta dos dois lados, mesmo em exercício dispensado', () => {
        // Tirá-la do total faria o percentual passar de 100%; tirá-la do feito
        // apagaria trabalho real da barra.
        expect(blocoDoProgresso).toMatch(/if \(feita\) \{ done\+\+; total\+\+; continue; \}/)
    })

    it('série que FALTAVA em dispensado sai do total', () => {
        expect(blocoDoProgresso).toMatch(/if \(dispensado\) continue;/)
    })

    it('não sobrou a contagem antiga, que somava tudo sem olhar a dispensa', () => {
        expect(controller).not.toMatch(/total \+= count;/)
    })
})

describe('dispensar não convive com adiar', () => {
    /**
     * As duas marcas se contradizem: uma diz "cobre depois", a outra diz "não
     * cobre". Deixar as duas no mesmo exercício faria o aviso de finalizar
     * cobrar algo que já foi dispensado.
     */
    it('dispensar limpa a marca de adiado', () => {
        const ini = controller.indexOf('const skipExerciseToday')
        expect(ini).toBeGreaterThan(-1)
        const corpo = controller.slice(ini, controller.indexOf('const unskipExercise'))
        expect(corpo).toMatch(/setDeferredExercises/)
        expect(corpo).toMatch(/next\.delete\(i\)/)
    })
})

describe('a ação e a volta atrás existem na tela', () => {
    it('tem o botão de dispensar', () => {
        expect(card).toMatch(/Não vou fazer esse hoje/)
        expect(card).toMatch(/skipExerciseToday\?\.\(exIdx\)/)
    })

    it('tem como voltar atrás', () => {
        expect(card).toMatch(/Vou fazer sim/)
        expect(card).toMatch(/unskipExercise\?\.\(exIdx\)/)
    })

    /**
     * Adiar o último pendente não leva a lugar nenhum (por isso aquele botão
     * exige destino), mas DISPENSAR o último é legítimo — é dizer "terminei o
     * que ia fazer hoje". Exigir destino aqui esconderia a ação justamente no
     * caso mais comum: o último exercício que a pessoa resolve não fazer.
     */
    it('dispensar NÃO exige destino, diferente do adiar', () => {
        const ini = card.indexOf('Não vou fazer esse hoje')
        const trecho = card.slice(Math.max(0, ini - 900), ini)
        expect(trecho).not.toMatch(/temDestinoAoAdiar/)
    })

    it('o selo do dispensado é neutro, não âmbar de pendência', () => {
        const ini = card.indexOf('Fora do treino de hoje')
        expect(ini).toBeGreaterThan(-1)
        const bloco = card.slice(Math.max(0, ini - 400), ini)
        expect(bloco, 'âmbar sinaliza pendência — dispensa é o oposto').not.toMatch(/amber-/)
    })
})

describe('a marca sobrevive a fechar o app', () => {
    it('é persistida, como o "fazer depois"', () => {
        expect(modais).toMatch(/skippedKey/)
        expect(modais).toMatch(/setItem\(skippedKey/)
    })
})
