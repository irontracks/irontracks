import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { BACK_OVERLAYS, FRONT_OVERLAYS } from '@/lib/muscleMap/overlays'

/**
 * O mapa muscular pinta o músculo sobrepondo um PNG à foto do manequim, e o
 * recorte de QUAL músculo acende vem do canal ALFA do próprio PNG (a máscara
 * do corpo só impede vazamento para fora da silhueta — ela não distingue peito
 * de coxa). PNG opaco de ponta a ponta nessa pasta acende o corpo inteiro.
 *
 * Foi assim que `public/muscle-overlays-female/` nasceu inútil em 13/03/2026:
 * arte de estoque exportada para composição por blend, 100% opaca, cada arquivo
 * num enquadramento diferente. O commit eb55b1b03 tirou a pasta do render no
 * mesmo dia e as bases femininas foram trocadas por versões alinhadas ao
 * manequim masculino — os overlays de `/muscle-overlays/` já desenham anatomia
 * feminina (o `front-chest.png` é um torso com seios) e servem os dois gêneros.
 * A pasta ficou órfã e enganou quem passou depois. Ver CLAUDE.md.
 *
 * As três superfícies que desenham o corpo (tela, PDF e manequim do Story) leem
 * a tabela única `lib/muscleMap/overlays.ts`, e é dela que este guard tira a
 * lista de nomes — mirar no arquivo que CONSOME deixaria um consumidor novo
 * fora da varredura sem ninguém perceber.
 */

const OVERLAY_DIR = join(process.cwd(), 'public/muscle-overlays')
const PUBLIC_DIR = join(process.cwd(), 'public')

/** Nomes de PNG que a tabela única manda desenhar. */
const arquivosReferenciados = (): Set<string> =>
    new Set([...FRONT_OVERLAYS, ...BACK_OVERLAYS].map((o) => o.file))

/**
 * Lê o IHDR do PNG e responde se ele carrega transparência: color type 4/6
 * têm canal alfa; type 3 (paleta) só transparece com um chunk `tRNS`.
 */
const temCanalAlfa = (caminho: string): boolean => {
    const buf = readFileSync(caminho)
    const colorType = buf[25]
    if (colorType === 4 || colorType === 6) return true
    if (colorType !== 3) return false
    return buf.includes(Buffer.from('tRNS', 'ascii'))
}

describe('overlays do mapa muscular', () => {
    it('todo PNG citado nas tabelas existe na pasta', () => {
        const faltando = [...arquivosReferenciados()].filter((n) => !existsSync(join(OVERLAY_DIR, n)))
        expect(faltando, `overlay citado no código sem PNG em public/muscle-overlays/: ${faltando.join(', ')}`).toEqual([])
    })

    it('todo PNG da pasta tem alfa — opaco acende o corpo inteiro', () => {
        const opacos = readdirSync(OVERLAY_DIR)
            .filter((n) => n.endsWith('.png'))
            .filter((n) => !temCanalAlfa(join(OVERLAY_DIR, n)))
        expect(
            opacos,
            `PNG sem canal alfa em public/muscle-overlays/: ${opacos.join(', ')}. ` +
            'O recorte do músculo é o alfa; sem ele o overlay pinta a silhueta inteira.',
        ).toEqual([])
    })

    /**
     * O caso acima varre `public/`, e por isso NÃO viu que `next.config.ts`
     * continuou listando o caminho da variante feminina no `images.localPatterns`
     * depois de a pasta ser apagada (achado da revisão de 26/08/2026). Config
     * que allowlista um caminho proibido não quebra nada — Next não serve
     * arquivo inexistente —, mas afirma no repo o contrário do que a decisão
     * diz, e é assim que a próxima pessoa reintroduz a pasta achando que era
     * suportada.
     *
     * Os comentários saem ANTES de casar (este arquivo e o `overlays.ts` citam
     * o caminho proibido justamente para explicar por que ele é proibido), mas
     * as STRINGS ficam: o alvo mora dentro de uma — `{ pathname: '/...' }`.
     *
     * ⚠️ Por isso o scanner anda caractere a caractere, e não por regex. A
     * primeira versão usava `/\/\*[\s\S]*?\*\//g` e era um GUARD FALSO: em
     * `next.config.ts` toda entrada termina em `/**` dentro de aspas, e esse
     * `/` + `*` abre um comentário que o regex não sabe que está numa string.
     * Só não explodia porque, por acaso, não havia nenhum `*` + `/` depois
     * daquele ponto do arquivo. Medido: repor a linha órfã E acrescentar um
     * JSDoc banal acima de `remotePatterns` fazia o strip comer as 25 linhas do
     * array inteiro — 4 de 4 casos VERDES com a linha proibida literalmente no
     * arquivo. O guard morria no único arquivo que existe para policiar.
     */
    it('nenhum código ou config aponta para overlay por gênero', () => {
        /**
         * Remove comentário de linha e de bloco APENAS em contexto de código —
         * o que está dentro de string, template ou regex literal é preservado.
         */
        const semComentarios = (src: string): string => {
            let out = ''
            let i = 0
            let ctx: 'codigo' | "'" | '"' | '`' | '/' = 'codigo'
            while (i < src.length) {
                const c = src[i]
                const prox = src[i + 1]
                if (ctx === 'codigo') {
                    if (c === '/' && prox === '/') {
                        while (i < src.length && src[i] !== '\n') i++
                        continue
                    }
                    if (c === '/' && prox === '*') {
                        i += 2
                        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
                        i += 2
                        continue
                    }
                    if (c === "'" || c === '"' || c === '`') ctx = c
                    else if (c === '/' && /[=(,:[!&|?{};+\-*%^~<>]\s*$/.test(out)) ctx = '/'
                    out += c
                    i++
                    continue
                }
                // dentro de string/template/regex: só o fechamento correspondente sai
                if (c === '\\') { out += c + (src[i + 1] ?? ''); i += 2; continue }
                if (c === ctx || (ctx === '/' && c === '\n')) ctx = 'codigo'
                out += c
                i++
            }
            return out
        }

        // O hífen É o padrão: a pasta canônica é `muscle-overlays/`, então
        // `muscle-overlays-` só aparece numa variante. Sem exigir letra depois —
        // com `[a-z]` o guard deixava passar caminho montado por concatenação
        // (`\`/muscle-overlays-${genero}\``), medido por mutação.
        //
        // Montado por partes de propósito: escrito inteiro, o padrão casaria com
        // este próprio arquivo e o guard se acusaria sozinho.
        const PROIBIDO = new RegExp('muscle' + '-overlays-', 'i')

        // Todo formato que pode carregar um caminho de asset: código, config e
        // estilo. Sem filtro nenhum o guard passaria a ler os PNGs de `public/`.
        const VARRIDOS = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|ya?ml)$/
        const CODIGO_JS = /\.(ts|tsx|js|jsx|mjs|cjs)$/

        const rastreados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
            .split('\0')
            .filter((f) => VARRIDOS.test(f))
            .filter((f) => !/(^|\/)package-lock\.json$/.test(f))

        const culpados = rastreados.filter((f) => {
            const abs = join(process.cwd(), f)
            if (!existsSync(abs)) return false // rastreado mas apagado do disco
            const src = readFileSync(abs, 'utf8')
            // O scanner entende comentário de JS. JSON não tem comentário, e em
            // CSS/YAML aplicá-lo leria errado (`#` do YAML, aspas com outra
            // semântica) — nesses o texto cru serve, e não há doc a proteger.
            return PROIBIDO.test(CODIGO_JS.test(f) ? semComentarios(src) : src)
        })

        expect(
            culpados,
            `caminho de overlay por gênero em: ${culpados.join(', ')}. ` +
            'Existe UMA pasta de overlays; o gênero troca a base e a máscara do corpo.',
        ).toEqual([])
    })

    it('existe UMA pasta de overlays — variante por gênero é overlay órfão', () => {
        const pastas = readdirSync(PUBLIC_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name.startsWith('muscle-overlays'))
            .map((d) => d.name)
        expect(
            pastas,
            'O gênero troca a BASE e a MÁSCARA do corpo, nunca os overlays. ' +
            'Pasta paralela vira 1 MB de asset que nenhum código lê (ver CLAUDE.md).',
        ).toEqual(['muscle-overlays'])
    })
})
