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

/**
 * A lista `TIPOS_EM_PRODUCAO` acima é uma FOTO do banco, e foto não enxerga
 * tipo raro: em 29/09/2026 o Sentry acusou 113 avisos de tipo desconhecido e
 * havia SETE tipos que o servidor grava sem entrada na tabela
 * (`daily_goal_hit`, `birthday`, `story_comment`, `mentioned_in_comment`,
 * `mentioned_in_chat`, `trial_ending`, `admin_vip_expiring`) — um aniversário
 * por ano não aparece numa janela de 180 dias que acabou de começar.
 *
 * Este caso lê a FONTE: todo arquivo que grava notificação, e dentro dele todo
 * objeto com `type: '...'` que também tem `title`/`message` — o formato da
 * linha de `notifications`. Payload só de push (`{ type: 'team_chat' }`) não
 * tem título e fica de fora sozinho: ele nunca chega à Central.
 */
describe('todo tipo que o servidor GRAVA tem entrada na tabela', () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const RAIZ = join(__dirname, '..', '..')
    const GRAVA = /insertNotifications|from\(\s*['"]notifications['"]\s*\)\s*\.insert|notifyFollowers\(|createNotification\(/

    const arquivos: string[] = []
    const andar = (dir: string) => {
        for (const nome of readdirSync(dir)) {
            const p = join(dir, nome)
            if (nome === '__tests__' || nome === 'node_modules') continue
            if (statSync(p).isDirectory()) andar(p)
            else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(p)
        }
    }
    andar(RAIZ)

    const emitidos = new Map<string, string>()
    for (const arq of arquivos) {
        const src = readFileSync(arq, 'utf8')
        if (!GRAVA.test(src)) continue
        for (const m of src.matchAll(/type:\s*['"]([a-z_]+)['"]/g)) {
            // O resto do MESMO objeto: até a chave que o fecha, no mesmo nível.
            let prof = 0
            let fim = m.index! + m[0].length
            for (; fim < src.length; fim++) {
                const c = src[fim]
                if (c === '{' || c === '(' || c === '[') prof++
                else if (c === '}' || c === ')' || c === ']') { if (prof === 0) break; prof-- }
            }
            let ini = m.index!
            for (let p2 = 0; ini > 0; ini--) {
                const c = src[ini]
                if (c === '}' || c === ')' || c === ']') p2++
                else if (c === '{' || c === '(' || c === '[') { if (p2 === 0) break; p2-- }
            }
            const objeto = src.slice(ini, fim)
            if (/\b(title|message)\s*:/.test(objeto)) emitidos.set(m[1], arq.slice(RAIZ.length + 1))
        }
    }

    it('o varredor achou os emissores de verdade', () => {
        // Sem isto, um parser que não casasse nada deixaria o caso de baixo verde.
        expect(emitidos.size).toBeGreaterThan(15)
        expect(emitidos.has('meal_reminder')).toBe(true)
    })

    it('nenhum tipo gravado cai no sino cinza "Info"', () => {
        const semEntrada = [...emitidos].filter(([t]) => !chavesDeclaradas.has(t)).map(([t, a]) => `${t} (${a})`)
        expect(semEntrada, `gravados sem entrada em TYPE_CONFIG: ${semEntrada.join(', ')}`).toEqual([])
    })
})
