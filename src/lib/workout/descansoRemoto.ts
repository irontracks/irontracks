/**
 * O descanso que o PROFESSOR dispara no aparelho do aluno.
 *
 * Pedido do dono (12/09/2026): "quando eu colocar Concluir dispara o descanso
 * pra ele, e aparece pra mim também, e eu posso pular o descanso como se fosse
 * ele — caso eu queira que naquela série não tenha tanto descanso".
 *
 * Como isso chega no aluno sem nenhum canal novo: `timerTargetTime` e
 * `timerContext` fazem parte do STATE da sessão, e o state inteiro já viaja
 * pelo Realtime — o app do aluno aplica o que vem de outro aparelho
 * (`useSessionSync`, "Genuinely foreign update from another device"). Então
 * escrever o alvo do timer no state É disparar o descanso lá.
 *
 * ⚠️ O alvo é um instante ABSOLUTO, não uma duração. Mandar "180 segundos"
 * obrigaria os dois aparelhos a concordarem sobre quando a contagem começou —
 * e eles têm relógios diferentes. Com o alvo absoluto, atraso de rede encurta
 * o descanso do aluno em vez de esticá-lo, que é o erro seguro: ninguém
 * descansa MAIS do que o professor mandou.
 *
 * ⚠️ E o alvo precisa ficar acima da folga de `sanitizeRestoredSession` (5 s no
 * futuro). Abaixo dela o app do aluno entende "descanso que venceu enquanto o
 * app estava fechado" e abre em modo silencioso — sem alarme, sem flash. Por
 * isso descanso curto demais não vira timer remoto: vira nada, e é melhor não
 * prometer.
 */

/** Abaixo disto o app do aluno trataria o timer como vencido (ver `sanitizeRestoredSession`). */
export const MINIMO_PARA_DESCANSO_REMOTO_S = 6

export interface PatchDeDescanso {
    timerTargetTime: number | null
    timerContext: {
        kind: 'rest'
        key: string
        nextKey: string | null
        restStartedAtMs: number
        /** Marca a origem: o descanso nasceu no controle do professor. */
        origem: 'teacher'
    } | null
}

export interface EntradaDoDescanso {
    /** Segundos configurados no exercício. */
    restTime: unknown
    /** Chave da série concluída ("exIdx-setIdx"). */
    key: string
    /** Próxima série, quando existe — o app do aluno usa para marcar o começo dela. */
    nextKey?: string | null
    /** Agora, injetado para o teste poder fixar. */
    agoraMs: number
}

/**
 * O patch que faz o descanso nascer no aluno — ou `null` quando não há descanso
 * a disparar (exercício sem tempo configurado, ou tempo curto demais para
 * sobreviver à folga do sanitize).
 */
export function descansoAoConcluir(entrada: EntradaDoDescanso): PatchDeDescanso | null {
    const segundos = Number(entrada?.restTime)
    if (!Number.isFinite(segundos) || segundos < MINIMO_PARA_DESCANSO_REMOTO_S) return null
    const agora = Number(entrada?.agoraMs)
    if (!Number.isFinite(agora) || agora <= 0) return null
    const key = String(entrada?.key ?? '').trim()
    if (!key) return null

    const nextKey = String(entrada?.nextKey ?? '').trim()
    return {
        timerTargetTime: agora + Math.round(segundos) * 1000,
        timerContext: {
            kind: 'rest',
            key,
            nextKey: nextKey || null,
            restStartedAtMs: agora,
            origem: 'teacher',
        },
    }
}

/**
 * O patch que ENCERRA o descanso — o "pular" do professor.
 *
 * Limpa os dois campos: deixar o contexto com o alvo nulo faria a barra do
 * aluno reabrir no primeiro re-render, porque ela decide por `timerTargetTime`
 * e o contexto órfão sobreviveria ao próximo patch.
 */
export function pularDescanso(): PatchDeDescanso {
    return { timerTargetTime: null, timerContext: null }
}

/** Há um descanso correndo agora? Usado pelos DOIS lados (aluno e professor). */
export function descansoEmAndamento(timerTargetTime: unknown, agoraMs: number): boolean {
    const alvo = Number(timerTargetTime)
    if (!Number.isFinite(alvo) || alvo <= 0) return false
    return alvo > Number(agoraMs)
}

/** Segundos que faltam, nunca negativos (o zero é o fim, não o começo do atraso). */
export function segundosRestantes(timerTargetTime: unknown, agoraMs: number): number {
    const alvo = Number(timerTargetTime)
    if (!Number.isFinite(alvo) || alvo <= 0) return 0
    return Math.max(0, Math.ceil((alvo - Number(agoraMs)) / 1000))
}
