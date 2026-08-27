import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A Central de Notificações não conhecia 12% do que o servidor manda.
 *
 * O cabeçalho do `TYPE_CONFIG` diz "Keys MUST match the `type` values emitted
 * by the server" — e ninguém tinha conferido contra o servidor. Medido no banco
 * de produção em 27/08/2026, janela de 180 dias: **620 de 5.212 notificações
 * (11,9%) caíam no `default`**, ou seja, sino cinza com rótulo "Info" e função
 * `social`.
 *
 * Os dois casos que doem:
 *
 * - `billing_issue` é falha de PAGAMENTO e chegava como `social`, a função
 *   descrita no próprio arquivo como "movimento da rede; informativo, não
 *   acionável".
 * - `admin_access_request` / `admin_new_signup` são pessoas esperando
 *   aprovação — AÇÃO — e chegavam com a mesma cara de um story curtido.
 *
 * Esta lista é uma FOTO do banco, e ela envelhece. É por isso que ela não é a
 * única defesa: `getTypeConfig` reporta ao Sentry quando cai no `default`, e é
 * esse aviso — não este arquivo — que pega o tipo que nascer amanhã.
 *
 * Para re-medir:
 *
 *   select type, count(*) from notifications
 *   where created_at > now() - interval '180 days'
 *   group by type order by count(*) desc;
 */

const SRC = readFileSync(join(__dirname, '..', 'NotificationCenter.tsx'), 'utf8')

/** Tipos observados no banco de produção em 27/08/2026 (180 dias). */
const TIPOS_EM_PRODUCAO = [
    'workout_start', 'friend_online', 'workout_finish', 'friend_pr', 'story_posted',
    'friends_trained_today', 'morning_briefing', 'friend_streak', 'pr_close',
    'friend_comeback', 'water_reminder', 'weekly_recap', 'friend_achievement',
    'streak_at_risk', 'inactivity', 'friend_weekly_goal', 'admin_access_request',
    'follow_request', 'message', 'muscle_weekly_insights', 'invite', 'friend_goal',
    'admin_new_signup', 'follow_accepted', 'billing_issue',
]

/** As chaves declaradas no TYPE_CONFIG do componente, lidas do próprio código. */
const chavesDeclaradas = (() => {
    const inicio = SRC.indexOf('const TYPE_CONFIG')
    const fim = SRC.indexOf('\n};', inicio)
    const bloco = SRC.slice(inicio, fim)
    return new Set(Array.from(bloco.matchAll(/^\s{4}([a-z_]+):\s*tipo\(/gm), (m) => m[1]))
})()

const funcaoDe = (chave: string) => {
    const m = new RegExp(`^\\s{4}${chave}:\\s*tipo\\([^\\n]*?'([a-z]+)'\\),`, 'm').exec(SRC)
    return m?.[1] ?? ''
}

describe('a tabela de tipos cobre o que o servidor manda', () => {
    it('todo tipo visto em produção tem entrada própria', () => {
        const semEntrada = TIPOS_EM_PRODUCAO.filter((t) => !chavesDeclaradas.has(t))
        expect(semEntrada, `sem entrada em TYPE_CONFIG (caem no sino cinza "Info"): ${semEntrada.join(', ')}`).toEqual([])
    })

    it('o guard leu o TYPE_CONFIG de verdade', () => {
        // Sem isto, um parser que devolvesse conjunto vazio faria o caso acima
        // reprovar por motivo errado — ou, pior, um parser que casasse com tudo
        // faria passar sem medir nada.
        expect(chavesDeclaradas.size).toBeGreaterThan(20)
        expect(chavesDeclaradas.has('default')).toBe(true)
    })
})

describe('a função diz o que a notificação exige de você', () => {
    it('falha de pagamento é AVISO, não movimento da rede', () => {
        expect(funcaoDe('billing_issue')).toBe('aviso')
    })

    it('gente esperando aprovação é AÇÃO', () => {
        expect(funcaoDe('admin_access_request')).toBe('acao')
        expect(funcaoDe('admin_new_signup')).toBe('acao')
    })

    /**
     * O vermelho é o único pigmento de alarme do app. Se cutucão de streak e de
     * inatividade também for vermelho, a cobrança de fatura perde como gritar —
     * é a mesma regra que já tirou o vermelho decorativo de Configurações.
     */
    it('cutucão não gasta o vermelho', () => {
        expect(funcaoDe('streak_at_risk')).toBe('lembrete')
        expect(funcaoDe('inactivity')).toBe('lembrete')
        expect(funcaoDe('water_reminder')).toBe('lembrete')
    })

    // O teto de vermelhos e o de ações moram em `notificacaoPorFuncao.test.ts`,
    // que é o dono dessa regra. Duplicar aqui criaria dois lugares cobrando a
    // mesma coisa com números diferentes — e um deles envelheceria calado.
})

describe('tipo desconhecido não passa em silêncio', () => {
    it('cair no default reporta, e reporta uma vez só por tipo', () => {
        const bloco = SRC.slice(SRC.indexOf('function getTypeConfig'))
        expect(bloco).toMatch(/logWarnRemote\(/)
        // Sem dedupe, o realtime re-renderiza e um tipo novo vira centenas de
        // eventos — o aviso morre afogado no próprio volume.
        expect(bloco).toMatch(/tiposDesconhecidosReportados\.has\(/)
        expect(bloco).toMatch(/tiposDesconhecidosReportados\.add\(/)
    })
})
