/**
 * adaptarAmbiente — o treino inteiro vira "em casa" num toque.
 *
 * A biblioteca já classifica onde cada exercício dá para fazer
 * (`exercise_library.environments`: **160 `gym`, 83 `home`**) e o grafo
 * `exercise_substitutions` já sabe o que substitui o quê (8.262 arestas, 2.702
 * curadas). Até 30/08/2026 **nada ligava as duas coisas**: a troca existia só
 * exercício por exercício, manual, uma de cada vez.
 *
 * O caso de uso é o motivo nº 1 de perder treino — viagem, feriado, academia
 * lotada ou fechada. Quem está nessa situação não vai trocar dez exercícios um
 * a um; vai pular o dia.
 *
 * Local e de graça: é o mesmo grafo do `exerciseSwapGraph`, sem IA no caminho.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { escolherDaBiblioteca, normalizarNomeDeExercicio, tokensDeExercicio } from './exerciseSwapGraph'

export type Ambiente = 'home' | 'gym'

export interface TrocaSugerida {
    /** Índice do exercício no treino — é por ele que a aplicação acontece. */
    indice: number
    de: string
    para: string
    /** 0–100, como o resto da UI. */
    similaridade: number
    equipamento: string
}

export interface PlanoDeAdaptacao {
    trocas: TrocaSugerida[]
    /** Já servem no ambiente alvo — ficam como estão. */
    mantidos: string[]
    /** Sem alternativa conhecida: o usuário precisa saber ANTES de aplicar. */
    semAlternativa: string[]
}

interface LinhaLib {
    id: string
    display_name_pt: string | null
    normalized_name: string | null
    aliases: string[] | null
    environments: string[] | null
    equipment: string[] | null
}

/** Serve no ambiente alvo? Sem `environments` preenchido, não se afirma nada. */
export function serveNoAmbiente(linha: { environments?: string[] | null }, alvo: Ambiente): boolean {
    const envs = Array.isArray(linha.environments) ? linha.environments : []
    return envs.includes(alvo)
}

/**
 * Monta o plano SEM aplicar nada.
 *
 * A separação é deliberada: trocar dez exercícios de uma vez é ação grande, e o
 * usuário confere a lista antes. Aplicar direto seria o app decidindo o treino
 * dele por conta.
 */
export async function planejarAdaptacao(
    supabase: SupabaseClient,
    nomesDosExercicios: string[],
    alvo: Ambiente = 'home',
): Promise<PlanoDeAdaptacao> {
    const vazio: PlanoDeAdaptacao = { trocas: [], mantidos: [], semAlternativa: [] }
    const nomes = (nomesDosExercicios ?? []).map((n) => String(n ?? '').trim()).filter(Boolean)
    if (!nomes.length) return vazio

    // Uma consulta para toda a biblioteca: são 251 linhas, e filtrar por nome
    // exigiria um `or` gigante que o PostgREST recusa. Trazer tudo é mais
    // barato que N consultas.
    const { data: biblioteca, error } = await supabase
        .from('exercise_library')
        .select('id, display_name_pt, normalized_name, aliases, environments, equipment')
    if (error || !biblioteca?.length) return vazio
    const lib = biblioteca as LinhaLib[]

    const origens = new Map<number, LinhaLib>()
    const resultado: PlanoDeAdaptacao = { trocas: [], mantidos: [], semAlternativa: [] }

    nomes.forEach((nome, indice) => {
        const achado = escolherDaBiblioteca(nome, lib)
        if (!achado) {
            // Exercício que a biblioteca não conhece: não dá para afirmar que
            // precisa trocar nem que já serve. Fica de fora, declarado.
            resultado.semAlternativa.push(nome)
            return
        }
        const linha = lib.find((l) => l.id === achado.id)!
        if (serveNoAmbiente(linha, alvo)) {
            resultado.mantidos.push(nome)
            return
        }
        origens.set(indice, linha)
    })

    if (!origens.size) return resultado

    const { data: arestas } = await supabase
        .from('exercise_substitutions')
        .select('from_id, to_id, similarity')
        .in('from_id', [...origens.values()].map((l) => l.id))
        .order('similarity', { ascending: false })

    const porOrigem = new Map<string, Array<{ to_id: string; similarity: number }>>()
    for (const a of arestas ?? []) {
        const lista = porOrigem.get(String(a.from_id)) ?? []
        lista.push({ to_id: String(a.to_id), similarity: Number(a.similarity) || 0 })
        porOrigem.set(String(a.from_id), lista)
    }

    for (const [indice, origem] of origens) {
        const candidatos = porOrigem.get(origem.id) ?? []
        // Já vêm ordenados por similaridade; o primeiro que serve no ambiente
        // vence. Sem candidato que sirva, o exercício FICA — e é declarado.
        const escolhido = candidatos
            .map((c) => ({ c, alvoLinha: lib.find((l) => l.id === c.to_id) }))
            .find((x) => x.alvoLinha && serveNoAmbiente(x.alvoLinha, alvo))

        const nomeOriginal = nomes[indice]
        if (!escolhido?.alvoLinha) {
            resultado.semAlternativa.push(nomeOriginal)
            continue
        }
        resultado.trocas.push({
            indice,
            de: nomeOriginal,
            para: String(escolhido.alvoLinha.display_name_pt ?? '').trim() || nomeOriginal,
            similaridade: Math.round(Math.max(0, Math.min(1, escolhido.c.similarity)) * 100),
            equipamento: (escolhido.alvoLinha.equipment ?? []).join(', ').replace(/_/g, ' ') || 'peso corporal',
        })
    }

    resultado.trocas.sort((a, b) => a.indice - b.indice)
    return resultado
}

/** Frase do resumo, para o usuário decidir antes de aplicar. */
export function resumoDaAdaptacao(p: PlanoDeAdaptacao): string {
    const partes: string[] = []
    if (p.trocas.length) partes.push(`${p.trocas.length} ${p.trocas.length === 1 ? 'exercício trocado' : 'exercícios trocados'}`)
    if (p.mantidos.length) partes.push(`${p.mantidos.length} já servem`)
    if (p.semAlternativa.length) partes.push(`${p.semAlternativa.length} sem alternativa`)
    return partes.join(' · ')
}

export { normalizarNomeDeExercicio, tokensDeExercicio }
