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

/** Quanto o descanso já passou do planejado (0 enquanto ele ainda corre). */
export function segundosAlemDoPlanejado(timerTargetTime: unknown, agoraMs: number): number {
    const alvo = Number(timerTargetTime)
    if (!Number.isFinite(alvo) || alvo <= 0) return 0
    return Math.max(0, Math.round((Number(agoraMs) - alvo) / 1000))
}

/** Há um descanso na tela do aluno — correndo OU já vencido esperando o START. */
export function descansoNaTela(timerTargetTime: unknown): boolean {
    const alvo = Number(timerTargetTime)
    return Number.isFinite(alvo) && alvo > 0
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

const paraNumero = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
    return Number.isFinite(n) ? n : 0
}

export interface SessaoParaInicioDeSerie {
    logs?: unknown
    ui?: unknown
    timerContext?: unknown
}

export interface PatchDeInicioDeSerie {
    timerTargetTime: null
    timerContext: null
    logs: Record<string, unknown>
    ui: Record<string, unknown>
}

/**
 * O START ▶ do professor — o mesmo botão que o aluno tem no fim do descanso.
 *
 * Pedido do dono (12/09/2026): "quando termina o descanso e não está no
 * automático, precisa clicar no start para iniciar a contagem de tempo daquela
 * série; eu preciso ter esse controle aqui". Sem ele o professor via o descanso
 * zerar e não tinha como destravar o aluno de onde ele estava.
 *
 * ⚠️ Não basta limpar o timer (é o que `pularDescanso` faz). O START do aluno
 * (`handleStartFromRestTimer`) faz TRÊS coisas, e as três somem se o professor
 * só apagar o alvo: grava quanto o descanso REALMENTE durou na série que
 * acabou, carimba o começo da PRÓXIMA série, e marca a execução em curso. O
 * `restSeconds` e o `startedAtMs` alimentam a duração da sessão e a estimativa
 * de calorias — perdê-los não dá erro nenhum, só um relatório mais pobre.
 *
 * Espelha o aluno também no que ele NÃO faz: série já concluída não é
 * recarimbada, e sem `nextKey` (métodos que não anunciam a próxima) o START
 * apenas encerra o descanso — inventar uma próxima série aqui criaria log de
 * uma série que ninguém vai fazer.
 *
 * O relógio é parâmetro de propósito: com o flush imediato o updater roda duas
 * vezes (UI e servidor), e um `Date.now()` lá dentro daria dois instantes
 * diferentes — o mesmo cuidado do `descansoAoConcluir`.
 */
export function iniciarSerieRemota(
    sessao: SessaoParaInicioDeSerie | null | undefined,
    agoraMs: number,
): PatchDeInicioDeSerie {
    const ctx = ehObjeto(sessao?.timerContext) ? sessao.timerContext : {}
    const logs: Record<string, unknown> = ehObjeto(sessao?.logs) ? { ...sessao.logs } : {}
    const ui: Record<string, unknown> = ehObjeto(sessao?.ui) ? { ...sessao.ui } : {}
    const agora = paraNumero(agoraMs)
    if (agora <= 0) return { timerTargetTime: null, timerContext: null, logs, ui }

    // A série que ACABOU: registra o descanso de verdade, não o planejado.
    const prevKey = String(ctx.key ?? '').trim()
    if (prevKey) {
        const prevLog = ehObjeto(logs[prevKey]) ? { ...logs[prevKey] } : {}
        const base = paraNumero(ctx.restStartedAtMs) || paraNumero(prevLog.completedAtMs)
        if (base > 0) {
            logs[prevKey] = { ...prevLog, restSeconds: Math.max(0, Math.round((agora - base) / 1000)) }
        }
    }

    // A série que COMEÇA agora.
    const nextKey = String(ctx.nextKey ?? '').trim()
    if (nextKey) {
        const nextLog = ehObjeto(logs[nextKey]) ? { ...logs[nextKey] } : {}
        if (!nextLog.done) {
            logs[nextKey] = { ...nextLog, startedAtMs: agora }
            ui.activeExecution = { key: nextKey, startedAtMs: agora }
        }
    }

    return { timerTargetTime: null, timerContext: null, logs, ui }
}
