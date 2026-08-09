import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Diagnóstico do volume do Iron Rank em `audit_events` — ago/2026.
 *
 * O card mostrava "0kg levantados" para uma conta com 2.427.394 kg. A
 * instrumentação de #716 mandou o sinal ao Sentry, e ali ele fica ilegível de
 * onde se investiga: o token não existe no repo nem no ambiente local. Mesmo
 * impasse da Live Activity em 04/08 — e mesma saída, porque `audit_events`
 * responde a um SELECT e não expira.
 *
 * A causa provável tem nome: `iron_rank_my_total_volume` faz
 * `RAISE EXCEPTION 'not_authenticated'` quando `auth.uid()` vem NULL, e o
 * supabase-js entrega isso no RETORNO. O `code` gravado confirma ou derruba a
 * hipótese sem depender de reproduzir o bug.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..')
const rota = readFileSync(join(__dirname, '..', 'iron-rank', 'route.ts'), 'utf8')
const action = readFileSync(join(RAIZ, 'actions', 'workout-analytics-actions.ts'), 'utf8')

const executavel = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('a rota grava onde dá para consultar', () => {
    it('escreve em audit_events com a ação esperada', () => {
        const codigo = executavel(rota)
        expect(codigo).toContain("from('audit_events')")
        // O nome da ação é o que a consulta SQL procura — mudá-lo sem atualizar
        // a documentação deixaria o histórico órfão.
        expect(codigo).toContain("action: 'iron_rank_volume_failed'")
    })

    it('usa service-role: audit_events é read-only pro cliente', () => {
        expect(executavel(rota), 'sem admin o insert falha calado e não grava nada')
            .toContain('createAdminClient')
    })

    it('exige usuário autenticado', () => {
        // Sem isto, qualquer um enche a tabela de auditoria.
        expect(executavel(rota)).toContain('requireUser')
    })

    it('tem rate limit', () => {
        expect(executavel(rota)).toContain('checkRateLimitAsync')
    })

    it('nunca devolve erro ao app', () => {
        // O usuário abriu o dashboard para ver o rank; telemetria que quebra a
        // tela é pior que telemetria nenhuma. Todos os caminhos devolvem ok.
        const codigo = executavel(rota)
        expect(codigo).toMatch(/if \(error\) logError\('diag:iron-rank:insert', error\)/)
        expect(codigo).toMatch(/catch[\s\S]{0,120}NextResponse\.json\(\{ ok: true \}\)/)
    })

    it('o schema é estrito e cobre os dois estágios', () => {
        const codigo = executavel(rota)
        expect(codigo).toContain('.strict()')
        expect(codigo).toMatch(/z\.enum\(\['rpc_error', 'zero_com_historico'\]\)/)
    })
})

describe('a action chama a rota nos DOIS pontos de falha', () => {
    const codigo = executavel(action)

    it('reporta o erro do RPC', () => {
        expect(codigo).toMatch(/reportIronRankToAudit\(\{\s*stage: 'rpc_error'/)
    })

    it('reporta o zero contraditório', () => {
        expect(codigo).toMatch(/reportIronRankToAudit\(\{\s*stage: 'zero_com_historico'/)
    })

    it('continua reportando ao Sentry também', () => {
        // Os dois destinos servem a públicos diferentes: o Sentry alerta na
        // hora, o audit_events responde meses depois. Trocar um pelo outro
        // perde metade do valor.
        expect(codigo.match(/logWarnRemote\(/g) || []).toHaveLength(3)
    })

    it('é fire-and-forget: não bloqueia a tela nem propaga erro', () => {
        expect(codigo, 'await aqui atrasaria o dashboard por telemetria')
            .toMatch(/void fetch\('\/api\/diag\/iron-rank'/)
        expect(codigo).toMatch(/\}\)\.catch\(\(\) => \{ \}\)/)
    })

    it('trunca os campos antes de enviar', () => {
        // O `message` do Postgres pode vir gigante; o schema da rota corta em
        // 300 e devolveria 400, perdendo o evento justamente na falha.
        expect(codigo).toMatch(/String\(detail\.message\)\.slice\(0, 300\)/)
        expect(codigo).toMatch(/String\(detail\.code\)\.slice\(0, 60\)/)
    })
})
