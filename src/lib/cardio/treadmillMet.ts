/**
 * MET de esteira a partir de VELOCIDADE e INCLINAÇÃO — equações do ACSM.
 *
 * Por que este módulo existe: até 04/09/2026 a caloria de cardio saía de uma
 * tabela por MODALIDADE (`esteira: 6.0`) escalada pelo RPE. Ou seja, caminhar
 * 30 min a 4 km/h e correr 30 min a 10 km/h davam a MESMA estimativa se o RPE
 * fosse o mesmo — e a inclinação, que o app coleta na esteira desde sempre,
 * não entrava em conta nenhuma.
 *
 * As equações do ACSM (Guidelines for Exercise Testing and Prescription) são o
 * padrão da área e usam as duas variáveis:
 *
 *   caminhada:  VO2 = 0,1 × S + 1,8 × S × G + 3,5
 *   corrida:    VO2 = 0,2 × S + 0,9 × S × G + 3,5
 *
 * com S em metros/minuto, G a inclinação como fração (10% = 0,10) e VO2 em
 * ml/kg/min. MET = VO2 / 3,5.
 *
 * Conferência contra o Compendium of Physical Activities (2011), que é a fonte
 * da tabela antiga — os números batem, o que dá confiança nas duas:
 *   5 km/h plano → 3,4 MET aqui, 3,5 no Compendium (walking 4,8 km/h)
 *  10 km/h plano → 10,5 MET aqui, 9,8 no Compendium (running 9,7 km/h)
 */

/** Abaixo disto é caminhada; acima, corrida. */
const LIMITE_CORRIDA_KMH = 7

/**
 * O ACSM valida a equação de caminhada de 3 a 6,4 km/h e a de corrida acima de
 * 8 km/h. Entre 6,4 e 8 fica a zona ambígua (caminhada rápida ou trote leve);
 * 7 km/h é o meio dela e o ponto onde a maioria das pessoas passa a trotar.
 */
export const MET_MINIMO = 1

/** Teto de sanidade: acima disso é digitação errada, não treino. */
const VELOCIDADE_MAX_KMH = 30
const INCLINACAO_MAX_PCT = 40

/**
 * MET de um bloco de esteira.
 *
 * Devolve `null` quando não há velocidade utilizável — o chamador então cai na
 * tabela por modalidade, que é o comportamento de sempre. Devolver um número
 * inventado aqui seria pior que não responder: a caloria é lida por quem
 * acompanha dieta.
 */
export function metDeEsteira(
    velocidadeKmh: unknown,
    inclinacaoPct?: unknown,
): number | null {
    const v = Number(velocidadeKmh)
    if (!Number.isFinite(v) || v <= 0 || v > VELOCIDADE_MAX_KMH) return null

    const iRaw = Number(inclinacaoPct)
    // Inclinação ausente é 0% (esteira plana), não motivo para desistir — a
    // maioria dos registros não tem inclinação preenchida.
    const i = Number.isFinite(iRaw) && iRaw > 0 ? Math.min(iRaw, INCLINACAO_MAX_PCT) : 0

    const metrosPorMin = (v * 1000) / 60
    const grade = i / 100

    const vo2 = v < LIMITE_CORRIDA_KMH
        ? 0.1 * metrosPorMin + 1.8 * metrosPorMin * grade + 3.5
        : 0.2 * metrosPorMin + 0.9 * metrosPorMin * grade + 3.5

    const met = vo2 / 3.5
    return met > MET_MINIMO ? met : MET_MINIMO
}

/** kcal de um bloco: MET × peso(kg) × horas. */
export function kcalDoBloco(met: number, pesoKg: number, minutos: number): number {
    if (!Number.isFinite(met) || met <= 0) return 0
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) return 0
    if (!Number.isFinite(minutos) || minutos <= 0) return 0
    return met * pesoKg * (minutos / 60)
}
