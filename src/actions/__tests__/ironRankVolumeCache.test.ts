/**
 * Guard do cache do volume total do Iron Rank (perf, ago/2026).
 *
 * Sintoma: `iron_rank_my_total_volume` varre TODOS os workouts do banco
 * (~95ms de Postgres) e era chamada a CADA visita ao dashboard — 11.750
 * execuções medidas. O custo cresce com a base inteira, não com o usuário.
 *
 * Invariantes:
 * 1. a RPC só roda em cache-miss (localStorage, TTL 30min);
 * 2. a chave inclui `totalWorkouts` — finalizar/excluir treino muda a
 *    contagem → chave nova → valor fresco (auto-invalidação). Sem isso o
 *    usuário terminaria um treino e o rank não subiria por meia hora.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const src = readFileSync(path.resolve(__dirname, '../workout-analytics-actions.ts'), 'utf8')

describe('cache do iron_rank_my_total_volume', () => {
    it('chave inclui user.id e totalWorkouts (auto-invalida ao finalizar treino)', () => {
        expect(src).toMatch(/ironRankVol\.\$\{user\.id\}\.\$\{totalWorkouts\}/)
    })

    it('RPC só roda em cache-miss', () => {
        const cacheIdx = src.indexOf('const cachedVol')
        const rpcIdx = src.indexOf("supabase.rpc('iron_rank_my_total_volume')")
        expect(cacheIdx).toBeGreaterThan(-1)
        expect(rpcIdx).toBeGreaterThan(cacheIdx)
        // A chamada precisa estar no ramo else do hit de cache.
        const between = src.slice(cacheIdx, rpcIdx)
        expect(between).toContain('if (cachedVol != null)')
    })

    it('TTL definido (staleness de edição de treino antigo é limitada)', () => {
        expect(src).toMatch(/VOL_CACHE_TTL_MS = 30 \* 60 \* 1000/)
    })
})

/**
 * Falha silenciosa do volume — ago/2026.
 *
 * A conta do dono tem 2.427.394 kg e 127 treinos no banco; o card mostrava
 * "0kg levantados · Iniciante do Ferro". O RPC calcula certo (conferido por
 * SQL) e os grants estão corretos, então a perda estava no cliente — e era
 * INVISÍVEL por dois motivos somados:
 *
 * 1. `if (!vErr) { ... }` sem ramo de erro. O supabase-js devolve a falha no
 *    RETORNO, não como exceção, então o `catch` nunca via nada: volume ficava
 *    0 e o código seguia como se tivesse dado certo.
 * 2. o único log do caminho era `logWarn`, que é NO-OP em produção
 *    (`if (IS_PROD) return`) — ausente exatamente onde o bug vive.
 *
 * O sintoma na tela é idêntico ao de um usuário novo, o que torna o relato
 * ("meu rank zerou") indistinguível de uso normal sem telemetria.
 */
describe('o volume não pode falhar em silêncio', () => {
    // O erro nº2 da lista de guards falsos do CLAUDE.md: o comentário que
    // EXPLICA o padrão proibido casa com a busca por ele. Reduzir ao código.
    // A barra é escapada de propósito: escrever o literal de duas barras aqui
    // faz o guard de ambientes (vitestDomProjectList) tratar o resto da linha
    // como comentário, desalinhar o parser de strings do arquivo inteiro e
    // acusar este source-guard de precisar de DOM. Custou um CI vermelho.
    const executavel = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.trim()))
        .join('\n')

    it('erro do RPC é reportado, não engolido', () => {
        const idx = executavel.indexOf("supabase.rpc('iron_rank_my_total_volume')")
        expect(idx).toBeGreaterThan(-1)
        const bloco = executavel.slice(idx, idx + 1400)
        expect(bloco, 'sem ramo de erro, vErr some e o volume vira 0 calado')
            .toMatch(/if \(vErr\)/)
        expect(bloco, 'o ramo de erro precisa emitir sinal remoto').toContain('logWarnRemote')
    })

    it('volume 0 com treinos no histórico é contradição e vira sinal', () => {
        expect(executavel).toMatch(/totalVolumeKg === 0 && totalWorkouts > 0/)
    })

    it('o valor contraditório NÃO é cacheado', () => {
        // A chave é user.id+totalWorkouts e não muda até o próximo treino.
        // Cachear o 0 estende uma falha momentânea de sessão para 30 minutos.
        const idx = executavel.indexOf('localStorage.setItem(volCacheKey')
        expect(idx).toBeGreaterThan(-1)
        const guarda = executavel.slice(executavel.lastIndexOf('if (', idx), idx)
        expect(guarda, 'gravar volume 0 com histórico congela o sintoma')
            .toContain('!contraditorio')
    })

    it('não usa logWarn — é no-op em produção', () => {
        expect(executavel, 'logWarn não existe em prod; use logWarnRemote')
            .not.toMatch(/\blogWarn\s*\(/)
    })
})
