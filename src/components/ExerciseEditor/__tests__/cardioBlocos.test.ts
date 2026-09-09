import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Cardio em BLOCOS — a fiação.
 *
 * O pedido: "vou caminhar 30 min, sendo 5 a 4 km/h, 10 a 5 e 15 a 6". O modelo
 * de dados já suportava (velocidade/inclinação/duração são POR SÉRIE, e a
 * execução renderiza uma por série); o que travava era só o editor, fixado em
 * `setDetails[0]` desde sempre.
 *
 * Medido antes de construir: em produção NENHUM cardio tinha múltiplas séries
 * com velocidade — o caminho existia e nunca fora exercitado, porque a porta de
 * entrada estava fechada.
 */
const SRC = join(__dirname, '..', '..', '..')
/**
 * A mecânica dos blocos vive em UM arquivo desde 09/09/2026 — antes disso ela
 * morava dentro do `CardioFields`, e o modal rápido do lápis do card (a porta
 * que a mão alcança no meio do treino) não tinha blocos nenhum: o dono
 * perguntou "cadê, foi regressão?" tendo a feature no ar havia dias.
 */
const editor = readFileSync(join(SRC, 'components/ExerciseEditor/CardioBlocosEditor.tsx'), 'utf8')
const campos = readFileSync(join(SRC, 'components/ExerciseEditor/CardioFields.tsx'), 'utf8')
const modal = readFileSync(join(SRC, 'components/workout/Modals.tsx'), 'utf8')
const card = readFileSync(join(SRC, 'components/workout/ExerciseCard.tsx'), 'utf8')
const kcal = readFileSync(join(SRC, 'utils/calories/cardioKcal.ts'), 'utf8')

describe('o editor escreve em TODOS os blocos, não só no primeiro', () => {
    it('não está mais fixado em setDetails[0]', () => {
        // ⚠️ A primeira versão só perguntava se `onUpdateSetDetail(i,` existia
        // EM ALGUM LUGAR do arquivo — e passou verde com uma das duas escritas
        // revertida para o índice 0 (pego por mutação). O que importa é que
        // NENHUMA escrita dentro de `atualizarBloco` use índice fixo.
        const ini = editor.indexOf('const atualizarBloco')
        expect(ini, 'a função que grava o bloco sumiu').toBeGreaterThan(-1)
        const fim = editor.indexOf('const adicionarBloco', ini)
        const corpo = editor.slice(ini, fim)

        const escritas = [...corpo.matchAll(/onUpdateSetDetail\(\s*([^,]+),/g)].map(m => m[1].trim())
        expect(escritas.length, 'atualizarBloco precisa gravar').toBeGreaterThan(0)
        for (const alvo of escritas) {
            expect(alvo, `grava em índice fixo (${alvo}) — o bloco 2 fica inalcançável`).toBe('i')
        }
    })

    it('dá para adicionar e remover bloco', () => {
        expect(editor).toMatch(/adicionarBloco/)
        expect(editor).toMatch(/removerBloco/)
    })

    it('remover o bloco do meio COMPACTA a lista — senão fica buraco', () => {
        expect(editor).toMatch(/for \(let j = i; j < blocos\.length - 1; j\+\+\)/)
    })

    it('cada bloco tem tempo, velocidade e inclinação próprios', () => {
        expect(editor).toMatch(/'minutos'/)
        expect(editor).toMatch(/'speed'/)
        expect(editor).toMatch(/'incline'/)
    })

    it('o tempo total vira soma, não um segundo campo digitável', () => {
        expect(campos).toMatch(/totalMinutosDosBlocos/)
        expect(campos).toMatch(/emBlocos \?/)
    })
})

describe('as DUAS superfícies de cardio oferecem blocos — pela mesma fonte', () => {
    /**
     * O defeito de 09/09/2026 não foi código faltando: era a feature existir só
     * na tela que ninguém abre no meio do treino. Guard de CLASSE — superfície
     * que edite cardio precisa MONTAR o editor único, e reimplementá-lo reprova.
     */
    for (const [nome, src] of [['editor completo', campos], ['modal rápido do card', modal]] as const) {
        it(`${nome} monta o CardioBlocosEditor`, () => {
            expect(src, `${nome} não oferece blocos ao usuário`).toMatch(/<CardioBlocosEditor/)
        })

        it(`${nome} não reimplementa a mecânica do bloco`, () => {
            const executavel = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
            expect(executavel, `${nome} tem cópia de adicionarBloco`).not.toMatch(/const adicionarBloco/)
            expect(executavel, `${nome} tem cópia de removerBloco`).not.toMatch(/const removerBloco/)
        })
    }

    it('o modal rápido esconde o que não existe em cardio', () => {
        // Sets (o nº de blocos manda), unilateral e tempo de troca não têm
        // sentido numa esteira — deixá-los é oferecer um controle que mente.
        expect(modal).toMatch(/ehCardio/)
    })
})

describe('na tela é BLOCO, não série', () => {
    it('o cabeçalho do cardio conta blocos', () => {
        expect(card).toMatch(/isExCardio/)
        expect(card).toMatch(/blocos/)
    })

    it('o exercício de força continua contando sets', () => {
        expect(card).toMatch(/\$\{setsCount\} sets/)
    })
})

describe('a caloria usa a velocidade de cada bloco', () => {
    it('consulta as equações do ACSM por bloco', () => {
        expect(kcal).toMatch(/metDeEsteira/)
        expect(kcal).toMatch(/blocosFeitos/)
    })

    /**
     * ⚠️ TODA sessão anterior a 04/09/2026 não tem `speed`. Se elas mudassem de
     * valor, o histórico de calorias de todo mundo seria reescrito por baixo dos
     * panos — e esse número vai para quem acompanha dieta.
     */
    it('sem velocidade, cai na tabela por modalidade como sempre', () => {
        expect(kcal).toMatch(/comVelocidade\.length > 0/)
        expect(kcal).toMatch(/metModalidade \* bw \* \(minutes \/ 60\) \* sexFactor/)
    })
})
