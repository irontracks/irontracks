/**
 * SSE do chat de IA — fonte única de codificação/decodificação.
 *
 * Eventos: {type:'chunk', text} incremental · {type:'done', ...extras} final ·
 * {type:'error', error} falha. O parser é incremental (mantém resto de buffer
 * entre reads) porque um chunk de rede pode cortar um evento no meio.
 *
 * Servidor (rota vip-coach) e client (VipHub) usam ESTE módulo — divergência
 * de framing entre os dois é exatamente a classe de bug que o guard
 * `sse.test.ts` trava (roundtrip encode→parse).
 */

export type AiSseEvent =
    | { type: 'chunk'; text: string }
    | ({ type: 'done' } & Record<string, unknown>)
    | { type: 'error'; error: string }

export const encodeSseEvent = (event: AiSseEvent): string =>
    `data: ${JSON.stringify(event)}\n\n`

/**
 * Consome `buffer + incoming`, emite os eventos completos e devolve o resto
 * (evento parcial ainda sem o `\n\n` final) para a próxima chamada.
 */
export function parseSseChunk(buffer: string, incoming: string): { events: AiSseEvent[]; rest: string } {
    const data = buffer + incoming
    const parts = data.split('\n\n')
    const rest = parts.pop() ?? ''
    const events: AiSseEvent[] = []
    for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        try {
            const parsed: unknown = JSON.parse(line.slice(6))
            if (parsed && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string') {
                events.push(parsed as AiSseEvent)
            }
        } catch { /* evento malformado é descartado — não derruba o stream */ }
    }
    return { events, rest }
}
