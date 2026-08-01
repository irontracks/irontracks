/**
 * Padrões de movimento por grupo muscular — a curadoria que faltava.
 *
 * O app já sabia QUANTO cada grupo foi treinado (séries) e QUANTO deveria ser
 * (`MUSCLE_GROUPS.minSets/maxSets`). O que nenhuma camada sabia é COMO: um
 * músculo com duas funções pode receber muito volume e ainda assim ter metade
 * do trabalho zerada.
 *
 * Foi exatamente o caso que originou este arquivo (ago/2026): 56 séries de
 * posterior de coxa, todas de flexão de joelho (mesa flexora), zero de extensão
 * de quadril. Volume alto, desenvolvimento moderado — e "adicione mais séries"
 * teria sido o conselho errado.
 *
 * ⚠️ A justificativa de cada padrão é MECANISMO, nunca citação. Referência
 * inventada por modelo generativo soa mais convincente que a verdadeira; aqui o
 * texto é escrito à mão e o que personaliza é o dado do usuário, não a fonte.
 */

import type { MuscleId } from '@/utils/muscleMapConfig'

export interface MovementPattern {
    /** Identificador estável do padrão dentro do grupo. */
    id: string
    /** Nome curto para a UI. */
    label: string
    /** Por que este padrão não é substituível pelo outro — o mecanismo, em 1 frase. */
    why: string
    /** Casa o nome do exercício (pt-BR, como o usuário digita/escolhe). */
    match: RegExp
    /**
     * `true` quando o grupo fica incompleto sem ele. Padrão não-essencial que
     * falta vira sugestão suave, não alerta.
     */
    essential: boolean
}

/**
 * Só grupos cujo trabalho se divide em padrões REALMENTE distintos entram aqui.
 * Grupo de função única (bíceps, panturrilha lateral…) não ganha entrada só pra
 * ter: falso "padrão faltando" gera conselho inútil e queima a confiança do card.
 */
export const MOVEMENT_PATTERNS: Partial<Record<MuscleId, MovementPattern[]>> = {
    hamstrings: [
        {
            id: 'knee_flexion',
            label: 'Flexão de joelho',
            why: 'Trabalha a porção distal, com o quadril fixo.',
            match: /flexora|leg\s*curl|nordic|flex[aã]o de joelho/i,
            essential: true,
        },
        {
            id: 'hip_extension',
            label: 'Extensão de quadril',
            why: 'O isquiotibial cruza duas articulações: sem carga em alongamento pelo quadril, metade da função dele nunca é treinada.',
            match: /stiff|romen|rdl|levantamento terra|deadlift|bom dia|good\s*morning|extens[aã]o de quadril|mesa romana/i,
            essential: true,
        },
    ],
    glutes: [
        {
            id: 'hip_extension',
            label: 'Extensão de quadril',
            why: 'É a função principal do glúteo máximo — nenhuma máquina de abdução substitui.',
            match: /eleva[cç][aã]o p[eé]lvica|hip\s*thrust|ponte|stiff|romen|rdl|terra|agachamento|leg\s*press|avanço|afundo|b[uú]lgaro/i,
            essential: true,
        },
        {
            id: 'abduction',
            label: 'Abdução',
            why: 'Pega glúteo médio e mínimo, que a extensão de quadril quase não recruta.',
            match: /abdutor|abdu[cç][aã]o|coice|kickback/i,
            essential: false,
        },
    ],
    calves: [
        {
            id: 'knee_extended',
            label: 'Joelho estendido',
            why: 'Com o joelho reto o gastrocnêmio assume a carga.',
            match: /em p[eé]|standing|leg\s*press|burrinho|smith/i,
            essential: true,
        },
        {
            id: 'knee_flexed',
            label: 'Joelho fletido',
            why: 'Sentado o gastrocnêmio encurta e o sóleo passa a trabalhar — é outro músculo, não outra variação.',
            match: /sentad|seated|s[oó]leo|solio/i,
            essential: true,
        },
    ],
    quads: [
        {
            id: 'squat_press',
            label: 'Agachamento / pressão',
            why: 'Carrega o quadríceps junto com quadril e tronco, em amplitude completa.',
            match: /agachamento|squat|leg\s*press|hack|avanço|afundo|b[uú]lgaro|passada/i,
            essential: true,
        },
        {
            id: 'knee_extension',
            label: 'Extensão de joelho',
            why: 'Isola o quadríceps e é o único que carrega bem o reto femoral com o quadril estendido.',
            match: /extensora|leg\s*extension|extens[aã]o de joelho/i,
            essential: false,
        },
    ],
    abs: [
        {
            id: 'trunk_flexion',
            label: 'Flexão de tronco',
            why: 'Encurta o reto abdominal sob carga — é o que constrói espessura.',
            match: /abdominal|crunch|supra|infra|eleva[cç][aã]o de pernas|canivete/i,
            essential: true,
        },
        {
            id: 'anti_extension',
            label: 'Anti-extensão / anti-rotação',
            why: 'Treina a função real do core, segurar a coluna sob carga — o que a flexão não cobre.',
            match: /prancha|plank|rollout|roda abdominal|pallof|anti[- ]rota/i,
            essential: false,
        },
    ],
    lats: [
        {
            id: 'vertical_pull',
            label: 'Puxada vertical',
            why: 'Carrega o dorsal em adução, o vetor que constrói largura.',
            match: /puxada|pulldown|barra fixa|pull[- ]?up|chin[- ]?up|graviton/i,
            essential: true,
        },
        {
            id: 'horizontal_pull',
            label: 'Puxada horizontal',
            why: 'Extensão de ombro com o tronco na horizontal — pega a porção mais espessa do dorsal.',
            match: /remada|row|serrote|cavalinho/i,
            essential: true,
        },
    ],
    chest: [
        {
            id: 'press',
            label: 'Pressão',
            why: 'Permite a carga mais alta e sustenta a maior parte do estímulo.',
            match: /supino|press|chest\s*press|flex[aã]o de bra[cç]o|mergulho|paralel/i,
            essential: true,
        },
        {
            id: 'fly',
            label: 'Adução (crucifixo)',
            why: 'Leva o peitoral ao alongamento com o cotovelo fixo, coisa que a pressão não faz.',
            match: /crucifixo|fly|peck\s*deck|voador|cross[- ]?over/i,
            essential: false,
        },
    ],
    triceps: [
        {
            id: 'elbow_extension',
            label: 'Extensão com braço ao lado',
            why: 'Trabalha as cabeças lateral e medial.',
            match: /tr[ií]ceps|corda|coice|kickback|mergulho|paralel|testa/i,
            essential: true,
        },
        {
            id: 'overhead',
            label: 'Extensão acima da cabeça',
            why: 'Só com o ombro em flexão a cabeça longa alonga sob carga.',
            match: /franc[eê]s|overhead|acima da cabe[cç]a|atr[aá]s da cabe[cç]a|testa/i,
            essential: false,
        },
    ],
}

export interface PatternCoverage {
    pattern: MovementPattern
    /** Séries encontradas no período para este padrão. */
    sets: number
    /** Exercícios do treino que casaram com o padrão. */
    exercises: string[]
}

/**
 * Cruza os exercícios treinados de um grupo com os padrões esperados.
 * Um exercício pode casar mais de um padrão (agachamento serve quadríceps e
 * glúteo) — de propósito: o objetivo é achar padrão AUSENTE, não ratear volume.
 */
export function coveragesForMuscle(
    muscle: MuscleId,
    exercises: ReadonlyArray<{ name: string; sets: number }>,
): PatternCoverage[] {
    const patterns = MOVEMENT_PATTERNS[muscle]
    if (!patterns) return []
    return patterns.map((pattern) => {
        const hits = exercises.filter((e) => pattern.match.test(String(e.name || '')))
        return {
            pattern,
            sets: hits.reduce((acc, e) => acc + (Number(e.sets) || 0), 0),
            exercises: hits.map((e) => e.name),
        }
    })
}

/** Padrões ESSENCIAIS sem nenhuma série no período. */
export function missingEssentialPatterns(coverages: readonly PatternCoverage[]): MovementPattern[] {
    return coverages.filter((c) => c.pattern.essential && c.sets === 0).map((c) => c.pattern)
}
