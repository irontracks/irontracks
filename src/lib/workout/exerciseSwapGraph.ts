/**
 * exerciseSwapGraph — trocar exercício sem IA, sem rede lenta e sem custo.
 *
 * `exercise_substitutions` é um grafo de equivalência entre exercícios: **8.262
 * arestas cobrindo 248 exercícios, 2.702 delas CURADAS à mão**. Ele existe
 * desde jul/2026, tem índice próprio `(from_id, similarity desc)` — feito para
 * exatamente esta busca — e RLS de leitura para autenticados.
 *
 * E até 29/08/2026 nenhum código de produto o lia: aparecia só num teste de RLS
 * e no catálogo LGPD. Enquanto isso `/api/ai/exercise-swap` chamava o **Gemini**
 * para responder a mesma pergunta — pagando por chamada, esperando rede e
 * gastando cota para devolver algo que já estava pronto no banco.
 *
 * O contexto de uso decide: quem toca em "trocar exercício" está de pé na
 * academia, com o aparelho ocupado. Quer a alternativa agora, não em três
 * segundos com barra de carregamento — e a rede da academia é o que é.
 *
 * A IA continua existindo como FALLBACK, para o que o grafo não cobre (248 dos
 * 251 da biblioteca, mas o usuário digita nome livre).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AlternativaDoGrafo {
    name: string
    reason: string
    /**
     * PERCENTUAL (0–100), não a fração do banco.
     *
     * A coluna `exercise_substitutions.similarity` é 0–1, mas a UI escreve
     * `{similarity}%` e a IA sempre devolveu 0–100. Sem a conversão, uma
     * alternativa perfeita (1.000) aparecia como **"1%"** na tela — e nenhum
     * teste pegaria, porque o número trafega igual dos dois lados.
     * Visto no aparelho em 29/08/2026.
     */
    similarity: number
    muscleGroups: string[]
    equipment: string
}

/** Quantas alternativas devolver — o mesmo que a IA devolvia. */
export const QUANTAS_ALTERNATIVAS = 4

/**
 * Normalização usada por `exercise_library.normalized_name`: minúscula, sem
 * acento, sem pontuação, espaços colapsados.
 */
export function normalizarNomeDeExercicio(nome: string): string {
    return String(nome ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

const VAZIAS = new Set(['de', 'do', 'da', 'com', 'e', 'ou', 'em', 'no', 'na', 'para'])

/** Tokens úteis para o casamento aproximado. */
export function tokensDeExercicio(nome: string): string[] {
    return normalizarNomeDeExercicio(nome)
        .split(' ')
        .filter((t) => t.length > 2 && !VAZIAS.has(t))
}

interface LinhaDaBiblioteca {
    id: string
    display_name_pt: string | null
    normalized_name: string | null
    aliases: string[] | null
}

/**
 * Escolhe, entre candidatos da biblioteca, o que melhor descreve o nome dado.
 *
 * Pontua por tokens em comum — "Supino reto" não existe na biblioteca (existem
 * "supino reto com barra" e "supino reto na maquina"), então match exato
 * sozinho responderia nada. Empate desempata pelo nome mais CURTO: entre
 * "supino reto com barra" e "supino reto com barra guiada", o mais curto é o
 * mais genérico e o palpite mais seguro.
 */
export function escolherDaBiblioteca(nome: string, candidatos: LinhaDaBiblioteca[]): LinhaDaBiblioteca | null {
    const alvo = normalizarNomeDeExercicio(nome)
    if (!alvo || !candidatos.length) return null

    const exato = candidatos.find(
        (c) => c.normalized_name === alvo || (c.aliases ?? []).some((a) => normalizarNomeDeExercicio(a) === alvo),
    )
    if (exato) return exato

    const doNome = new Set(tokensDeExercicio(nome))
    if (!doNome.size) return null

    let melhor: LinhaDaBiblioteca | null = null
    let melhorPontos = 0
    for (const c of candidatos) {
        const tokens = tokensDeExercicio(c.normalized_name ?? c.display_name_pt ?? '')
        if (!tokens.length) continue
        const pontos = tokens.filter((t) => doNome.has(t)).length
        // Exige que a MAIORIA dos tokens do candidato apareça: sem isso
        // "rosca direta" casaria com "supino reto" por conta de uma palavra
        // solta em comum.
        if (pontos === 0 || pontos * 2 < tokens.length) continue
        const nomeC = c.normalized_name ?? ''
        const melhorNome = melhor?.normalized_name ?? ''
        if (pontos > melhorPontos || (pontos === melhorPontos && nomeC.length < melhorNome.length)) {
            melhorPontos = pontos
            melhor = c
        }
    }
    return melhor
}

/** O porquê da sugestão, em uma linha, sem inventar nada além do que o dado diz. */
export function motivoDaTroca(args: {
    musculoIgual: boolean
    mesmoPadrao: boolean
    curada: boolean
    equipamento: string
}): string {
    if (args.curada) return `Equivalente conhecido${args.equipamento ? ` · ${args.equipamento}` : ''}`
    const partes: string[] = []
    if (args.musculoIgual) partes.push('mesmo músculo principal')
    if (args.mesmoPadrao) partes.push('mesmo padrão de movimento')
    if (!partes.length) partes.push('alternativa próxima')
    const base = partes.join(', ')
    return args.equipamento ? `${base} · ${args.equipamento}` : base
}

/**
 * Alternativas para `nomeDoExercicio`, direto do grafo. `null` quando o nome
 * não resolve na biblioteca ou o grafo não tem arestas — aí o chamador cai na
 * IA, que é o caminho que já existia.
 */
export async function alternativasDoGrafo(
    supabase: SupabaseClient,
    nomeDoExercicio: string,
): Promise<AlternativaDoGrafo[] | null> {
    const alvo = normalizarNomeDeExercicio(nomeDoExercicio)
    if (!alvo) return null

    const tokens = tokensDeExercicio(nomeDoExercicio)
    // Uma consulta só, por prefixo do token mais longo: a biblioteca tem 251
    // linhas, então o filtro existe para não trazer tudo — não para ser exato.
    const maisLongo = [...tokens].sort((a, b) => b.length - a.length)[0] ?? alvo
    const { data: candidatos, error } = await supabase
        .from('exercise_library')
        .select('id, display_name_pt, normalized_name, aliases, primary_muscle, secondary_muscles, equipment, is_compound')
        .or(`normalized_name.ilike.%${maisLongo}%,aliases.cs.{${alvo}}`)
        .limit(60)
    if (error || !candidatos?.length) return null

    const origem = escolherDaBiblioteca(nomeDoExercicio, candidatos as LinhaDaBiblioteca[])
    if (!origem) return null
    const origemCompleta = candidatos.find((c) => c.id === origem.id) as Record<string, unknown> | undefined

    const { data: arestas, error: erroArestas } = await supabase
        .from('exercise_substitutions')
        .select('similarity, source, exercise_library!exercise_substitutions_to_id_fkey(display_name_pt, primary_muscle, secondary_muscles, equipment, is_compound)')
        .eq('from_id', origem.id)
        .order('similarity', { ascending: false })
        .limit(QUANTAS_ALTERNATIVAS)
    if (erroArestas || !arestas?.length) return null

    const musculoOrigem = String(origemCompleta?.primary_muscle ?? '')
    const compostoOrigem = Boolean(origemCompleta?.is_compound)

    const out: AlternativaDoGrafo[] = []
    for (const a of arestas) {
        const alvoEx = (Array.isArray(a.exercise_library) ? a.exercise_library[0] : a.exercise_library) as
            | Record<string, unknown>
            | undefined
        const nome = String(alvoEx?.display_name_pt ?? '').trim()
        if (!nome) continue
        const equipamento = (Array.isArray(alvoEx?.equipment) ? (alvoEx?.equipment as string[]) : [])
            .join(', ')
            .replace(/_/g, ' ')
        const primario = String(alvoEx?.primary_muscle ?? '')
        const secundarios = Array.isArray(alvoEx?.secondary_muscles) ? (alvoEx?.secondary_muscles as string[]) : []
        out.push({
            name: nome,
            similarity: Math.round(Math.max(0, Math.min(1, Number(a.similarity) || 0)) * 100),
            equipment: equipamento || 'livre',
            muscleGroups: [primario, ...secundarios].filter(Boolean),
            reason: motivoDaTroca({
                musculoIgual: Boolean(primario) && primario === musculoOrigem,
                mesmoPadrao: Boolean(alvoEx?.is_compound) === compostoOrigem,
                curada: a.source === 'curated',
                equipamento,
            }),
        })
    }
    return out.length ? out : null
}
