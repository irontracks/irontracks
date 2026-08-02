/**
 * Guard do streaming do chat de IA (perf, ago/2026).
 *
 * Sintoma que motivou: nenhuma rota de IA fazia streaming — o usuário olhava
 * spinner por dezenas de segundos até a resposta INTEIRA ficar pronta.
 *
 * Invariantes:
 * 1. encode→parse é roundtrip perfeito (servidor e client usam ESTE módulo;
 *    framing divergente = chat mudo em silêncio);
 * 2. o parser é incremental: evento cortado no meio por um chunk de rede
 *    NÃO é perdido nem corrompido — fica no `rest` até completar;
 * 3. evento malformado é descartado sem derrubar o stream;
 * 4. rota vip-coach oferece o caminho SSE e o VipHub consome com o parser
 *    (source-guard — sem isso o streaming morre em silêncio num refactor).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { encodeSseEvent, parseSseChunk, type AiSseEvent } from '@/utils/ai/sse'

describe('roundtrip encode → parse', () => {
    it('reconstrói os eventos na ordem', () => {
        const evs: AiSseEvent[] = [
            { type: 'chunk', text: 'Olá' },
            { type: 'chunk', text: ' atleta!\ncom quebra' },
            { type: 'done', workout: { title: 'Treino A' }, dataUsed: ['5 treinos'] },
        ]
        const wire = evs.map(encodeSseEvent).join('')
        const { events, rest } = parseSseChunk('', wire)
        expect(rest).toBe('')
        expect(events).toEqual(evs)
    })

    it('evento cortado no meio sobrevive entre reads (incremental)', () => {
        const wire = encodeSseEvent({ type: 'chunk', text: 'texto longo do modelo' })
        const corte = Math.floor(wire.length / 2)
        const p1 = parseSseChunk('', wire.slice(0, corte))
        expect(p1.events).toEqual([])
        const p2 = parseSseChunk(p1.rest, wire.slice(corte))
        expect(p2.events).toEqual([{ type: 'chunk', text: 'texto longo do modelo' }])
        expect(p2.rest).toBe('')
    })

    it('evento malformado é descartado sem derrubar os demais', () => {
        const wire = 'data: {quebrado\n\n' + encodeSseEvent({ type: 'chunk', text: 'ok' })
        const { events } = parseSseChunk('', wire)
        expect(events).toEqual([{ type: 'chunk', text: 'ok' }])
    })
})

describe('source-guard: streaming ligado de ponta a ponta', () => {
    const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')

    it('rota vip-coach tem o caminho SSE com encodeSseEvent', () => {
        const rota = read('../../../app/api/ai/vip-coach/route.ts')
        expect(rota).toContain('encodeSseEvent')
        expect(rota).toContain('generateContentStream')
        expect(rota).toContain('text/event-stream')
    })

    it('VipHub pede stream e consome com parseSseChunk', () => {
        const hub = read('../../../components/VipHub.tsx')
        expect(hub).toContain('stream: true')
        expect(hub).toContain('parseSseChunk')
    })

    it('shim do Gemini expõe generateContentStream', () => {
        const shim = read('../gemini.ts')
        expect(shim).toContain('generateContentStream')
        expect(shim).toContain('generateContentStream(contents: GeminiContents)')
    })
})
