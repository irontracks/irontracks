/**
 * O nome do projeto Sentry é escrito em TRÊS arquivos — e eles divergiram.
 *
 * O app iOS e o site dividem o MESMO projeto: `javascript-nextjs` (org
 * `irontracks-company`, id 4511127085842432 — o mesmo id do DSN nativo). O nome
 * engana, porque ele nasceu para o Next.js, mas é lá que os eventos nativos
 * caem, lá que o `ios-release.sh` manda os dSYMs e lá que existem as releases
 * `ios@<versão>.<build>`.
 *
 * O `Sentry.xcconfig.example` dizia "Settings → Projects → irontracks-ios", um
 * projeto que NÃO existe. Em 10/09/2026, investigando um App Hang que chegou
 * com os frames colapsados, essa linha me fez concluir que o dSYM estava indo
 * para o projeto errado — hipótese inteira construída em cima de uma nota
 * falsa, derrubada só quando a API respondeu que o id do DSN e o id do
 * `javascript-nextjs` são o MESMO.
 *
 * O defeito não é o slug errado: é a mesma decisão escrita em três lugares sem
 * nada cobrar que concordem. É isso que estes casos travam.
 *
 * ⚠️ Ancorado no que FICA (o slug canônico e a igualdade entre as fontes), não
 * no `irontracks-ios` que a correção apagou — guard que cita a string removida
 * fica sem alvo (jeito nº 6 da lista de guards falsos do CLAUDE.md).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const nextConfig = readFileSync('next.config.ts', 'utf8')
const release = readFileSync('scripts/ios-release.sh', 'utf8')
const exemplo = readFileSync('ios/App/App/Sentry.xcconfig.example', 'utf8')

/** O slug que o upload de sourcemaps da web usa — a fonte mais antiga das três. */
const slugDaWeb = (() => {
    const m = /^\s*project:\s*["']([a-z0-9][a-z0-9-]*)["']/m.exec(nextConfig)
    expect(m, 'o `project:` do next.config sumiu — o guard ficou sem fonte').not.toBeNull()
    return m![1]
})()

describe('Sentry — um projeto só, escrito igual em todo lugar', () => {
    it('o release do iOS manda o dSYM para o MESMO projeto da web', () => {
        // dSYM no projeto errado = todo issue nativo chega ilegível, para sempre.
        const m = /SENTRY_PROJECT="\$\{SENTRY_PROJECT:-([a-z0-9][a-z0-9-]*)\}"/.exec(release)
        expect(m, 'o default de SENTRY_PROJECT sumiu do ios-release.sh').not.toBeNull()
        expect(m![1]).toBe(slugDaWeb)
    })

    it('o template do xcconfig aponta para esse projeto, e para nenhum outro', () => {
        // A linha "Settings → Projects → X" é a instrução que alguém segue para
        // achar o DSN. Apontando para o projeto errado, ela manda configurar o
        // app para um lugar onde ninguém procura os eventos.
        const citados = [...exemplo.matchAll(/Projects\s*→\s*([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1])
        expect(citados.length, 'o template parou de dizer onde achar o DSN').toBeGreaterThan(0)
        for (const slug of citados) expect(slug).toBe(slugDaWeb)
    })

    it('o template e o release concordam sobre o id do projeto', () => {
        // O id é o que prova a identidade: foi comparar o id do DSN com o id do
        // `javascript-nextjs` que derrubou a hipótese do projeto errado.
        const ids = new Set(
            [exemplo, release].flatMap((txt) => [...txt.matchAll(/\b(45\d{14})\b/g)].map((m) => m[1])),
        )
        expect(ids.size, `mais de um project id citado: ${[...ids].join(', ')}`).toBe(1)
    })

    it('o dSYM é enviado de forma RUIDOSA quando o token falta', () => {
        // Falha silenciosa aqui é o que deixou o Sentry nativo decorativo por
        // meses: a build sobe, o usuário trava, e o issue chega <redacted>.
        const bloco = release.slice(release.indexOf('SENTRY_CLI='))
        expect(bloco).toMatch(/SENTRY_AUTH_TOKEN[^\n]*\]; then[\s\S]{0,200}dSYM NÃO enviado/)
    })
})
