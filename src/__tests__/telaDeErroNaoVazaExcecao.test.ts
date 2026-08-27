import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

/**
 * Onze superfícies de erro despejavam a exceção crua na tela.
 *
 * Oito `error.tsx`, o `global-error.tsx` e os dois error boundaries de
 * componente mostravam, num painel `font-mono` vermelho, coisas como
 * "TypeError: Cannot read properties of undefined (reading 'map')".
 *
 * Para quem está na academia isso não é informação — é ansiedade. Ele não pode
 * fazer nada com aquele texto, e o texto ainda pode carregar nome de função
 * interna e trecho de payload. A stack tem um lugar, e é o Sentry.
 *
 * O que ficou na tela é o `digest` do Next: identificador OPACO e estável que o
 * suporte cruza com o log. Seis caracteres que o usuário consegue ditar por
 * telefone. Nos error boundaries de componente não há digest, então não há
 * painel nenhum — rótulo vazio só ocuparia espaço prometendo ajuda inexistente.
 *
 * ⚠️ O grep que achou tudo foi o da FORMA VISUAL (`font-mono text-xs
 * break-all`), não o do símbolo: procurar por `getErrorMessage(error)` deixou
 * passar `{String(errorMessage || error?.toString?.() || …)}` no
 * `dashboard/error.tsx`. Quando o defeito tem uma assinatura visual, é por ela
 * que se procura.
 */

const superficies = execSync(
    "find src -name 'error.tsx' -o -name 'global-error.tsx' -o -name '*ErrorBoundary.tsx' | sort",
    { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('tela de erro não entrega a exceção ao usuário', () => {
    it('o guard encontrou as superfícies', () => {
        expect(superficies.length).toBeGreaterThanOrEqual(10)
    })

    it('nenhuma renderiza a mensagem da exceção', () => {
        const vazando: string[] = []
        for (const arquivo of superficies) {
            const codigo = executavel(readFileSync(arquivo, 'utf8'))
            // Só o que vai para o JSX conta: `getErrorMessage` usado em LÓGICA
            // (o dashboard detecta ChunkLoadError por ele) é legítimo.
            const noJsx = [
                /\{\s*getErrorMessage\(error\)/,
                /\{\s*String\([^)]*error[^)]*\)\s*\}/,
                /\{\s*error[?.]*\.message\s*\}/,
                /\{\s*this\.state\.error[?.]*\.(message|toString\(\))/,
                /\{\s*errorMessage\s*\}/,
            ]
            if (noJsx.some((re) => re.test(codigo))) vazando.push(arquivo)
        }
        expect(
            vazando,
            'a exceção vai para o Sentry, não para a tela — use <CodigoDoErro digest={…} />:\n' + vazando.join('\n'),
        ).toEqual([])
    })

    /**
     * O painel some das superfícies de erro — e a checagem fica RESTRITA a
     * elas, de propósito.
     *
     * Duas tentativas de guard global falharam antes desta, e por motivos
     * opostos: `font-mono text-xs` acusou volume tabular, percentual de som e
     * coluna de tabela; `text-red-* + font-mono` acusou o contador de créditos
     * esgotados, o cronômetro em overtime e o painel ADMIN de erros — onde a
     * stack é justamente o produto.
     *
     * A conclusão é que a combinação de classes não identifica o defeito: o que
     * identifica é ONDE ela aparece. Encher um guard global de exceções para
     * seis usos corretos seria construir o papel de parede que este repo já
     * aprendeu a não construir.
     */
    it('nenhuma superfície de erro desenha painel de stack', () => {
        const comPainel = superficies.filter((arquivo) => {
            const codigo = executavel(readFileSync(arquivo, 'utf8'))
            return /text-red-\d+[^"]*font-mono|font-mono[^"]*text-red-\d+/.test(codigo)
        })
        expect(comPainel, 'vermelho + monoespaçado numa tela de erro = stack para o usuário').toEqual([])
    })
})

describe('o código de suporte é útil ou não aparece', () => {
    const comp = readFileSync('src/components/errors/CodigoDoErro.tsx', 'utf8')

    it('sem digest não desenha nada', () => {
        expect(comp).toMatch(/if \(!codigo\) return null/)
    })

    it('mostra o digest, nunca a mensagem', () => {
        expect(comp).toMatch(/\{codigo\}/)
        expect(executavel(comp)).not.toMatch(/message|getErrorMessage/)
    })
})
