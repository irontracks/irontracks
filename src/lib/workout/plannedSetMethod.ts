/**
 * Gravar o método de UMA série no PLANO do treino.
 *
 * O seletor de método sempre escreveu em `logs["ex-set"].per_set_method`, que é
 * da SESSÃO: trocar Drop-Set → Normal valia para o treino do dia e o plano
 * seguia igual, sem nenhuma pista de que aquilo era temporário. Quem ajustava o
 * treino de verdade repetia o ajuste toda semana — o mesmo defeito que
 * `askPersistSetChange` já tinha corrigido para adicionar/remover série.
 *
 * Puro de propósito: recebe os exercícios, devolve exercícios novos. Quem
 * pergunta ao usuário e quem grava no banco são outros (`useWorkoutExerciseCrud`
 * e a rota de update) — assim a REGRA de onde o método mora fica testável sem
 * montar treino nenhum.
 */

type UnknownRecord = Record<string, unknown>

const isObj = (v: unknown): v is UnknownRecord =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/** `setDetails` sob qualquer das duas grafias, sempre como array novo. */
export function setDetailsOf(ex: unknown): unknown[] {
    if (!isObj(ex)) return []
    const raw = Array.isArray(ex.setDetails)
        ? ex.setDetails
        : Array.isArray(ex.set_details)
            ? ex.set_details
            : []
    return [...raw]
}

/**
 * Devolve os exercícios com o método gravado na série pedida — ou `null` quando
 * não há o que gravar (índice inválido, método vazio).
 *
 * `null` em vez de "devolve igual": quem chama precisa saber que NADA mudou,
 * para não disparar uma escrita no plano que não escreve nada. Gravar um treino
 * inteiro à toa não é inofensivo aqui — a RPC de save APAGA e recria séries.
 *
 * As lacunas de `setDetails` são preenchidas com o mínimo (`set_number`): plano
 * antigo costuma ter menos detalhes que séries, e escrever direto no índice
 * deixaria buracos `undefined` que o payload da rota transformaria em série
 * vazia.
 */
export function applyPlannedSetMethod(
    exercises: unknown,
    exIdx: number,
    setIdx: number,
    method: string,
): unknown[] | null {
    const lista = Array.isArray(exercises) ? [...exercises] : null
    const escolhido = String(method ?? '').trim()
    if (!lista || !escolhido) return null
    if (!Number.isInteger(exIdx) || exIdx < 0 || exIdx >= lista.length) return null
    if (!Number.isInteger(setIdx) || setIdx < 0) return null

    const ex = isObj(lista[exIdx]) ? (lista[exIdx] as UnknownRecord) : null
    if (!ex) return null

    const sd = setDetailsOf(ex)
    const header = Math.max(0, Number.parseInt(String(ex.sets ?? '0'), 10) || 0)
    const total = Math.max(header, sd.length)
    // Série fora do plano (o "+ série extra" ainda não persistido, por exemplo):
    // gravar método numa série que o plano não tem inventaria a série junto.
    if (setIdx >= total) return null

    for (let i = 0; i < total; i += 1) {
        if (!isObj(sd[i])) sd[i] = { set_number: i + 1 }
    }
    sd[setIdx] = { ...(sd[setIdx] as UnknownRecord), per_set_method: escolhido }

    lista[exIdx] = { ...ex, setDetails: sd, set_details: sd }
    return lista
}
