import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O ditado por voz, exercitado sem microfone.
 *
 * O caso que mais importa aqui é o do TEXTO ACUMULADO. A implementação original
 * (inline no VoiceWorkoutModal) transportava o transcript num
 * `<input type="hidden">` lido por `getElementById` — gambiarra para fugir da
 * closure velha que o callback `onend` enxerga. O hook usa um ref; se alguém
 * trocar por estado, o teste de "duas falas" entrega vazio.
 */

const startNativeSpeechRecognition = vi.fn()
const stopNativeSpeechRecognition = vi.fn()
const requestVoicePermissions = vi.fn()
let iosNativo = false

vi.mock('@/utils/native/irontracksNative', () => ({
    startNativeSpeechRecognition: (...a: unknown[]) => startNativeSpeechRecognition(...a),
    stopNativeSpeechRecognition: (...a: unknown[]) => stopNativeSpeechRecognition(...a),
    requestVoicePermissions: (...a: unknown[]) => requestVoicePermissions(...a),
}))
vi.mock('@/utils/platform', () => ({ isIosNative: () => iosNativo }))

import { useSpeechToText, SILENCIO_PARA_ENCERRAR_MS } from '../useSpeechToText'

/** Reconhecedor web falso, dirigido pelo teste. */
class ReconhecedorFalso {
    static ultimo: ReconhecedorFalso | null = null
    lang = ''
    continuous = false
    interimResults = false
    onstart: (() => void) | null = null
    onresult: ((e: unknown) => void) | null = null
    onend: (() => void) | null = null
    onerror: ((e: { error?: string }) => void) | null = null
    parouCom = 0
    constructor() { ReconhecedorFalso.ultimo = this }
    start() { this.onstart?.() }
    stop() { this.parouCom++; this.onend?.() }
    abort() { }
    /** Empurra um resultado como o navegador faria. */
    emitir(texto: string, isFinal: boolean) {
        this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal, 0: { transcript: texto }, length: 1 }],
        })
    }
}

const comMicrofoneLiberado = () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    })
}

beforeEach(() => {
    iosNativo = false
    ReconhecedorFalso.ultimo = null
    startNativeSpeechRecognition.mockReset()
    stopNativeSpeechRecognition.mockReset()
    requestVoicePermissions.mockReset()
        ; (globalThis as unknown as Record<string, unknown>).SpeechRecognition = ReconhecedorFalso
    comMicrofoneLiberado()
})
afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).SpeechRecognition
    vi.useRealTimers()
})

describe('ditado na web', () => {
    it('entrega o texto reconhecido quando o reconhecedor encerra', async () => {
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))

        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())

        act(() => { ReconhecedorFalso.ultimo!.emitir('150g de arroz', true) })
        act(() => { ReconhecedorFalso.ultimo!.onend?.() })

        expect(onFinal).toHaveBeenCalledWith('150g de arroz')
    })

    it('ACUMULA duas falas — é o caso que a closure velha perdia', async () => {
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())

        act(() => { ReconhecedorFalso.ultimo!.emitir('150g de arroz ', true) })
        act(() => { ReconhecedorFalso.ultimo!.emitir('e 200g de patinho', true) })
        act(() => { ReconhecedorFalso.ultimo!.onend?.() })

        expect(onFinal).toHaveBeenCalledWith('150g de arroz e 200g de patinho')
    })

    it('o parcial aparece enquanto o reconhecedor ainda decide, e some no fim', async () => {
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())

        act(() => { ReconhecedorFalso.ultimo!.emitir('cento e cinq', false) })
        expect(result.current.parcial).toBe('cento e cinq')

        act(() => { ReconhecedorFalso.ultimo!.emitir('150g de arroz', true) })
        act(() => { ReconhecedorFalso.ultimo!.onend?.() })
        expect(result.current.parcial).toBe('')
        expect(result.current.gravando).toBe(false)
    })

    it('não chama onFinal quando ninguém falou nada', async () => {
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())
        act(() => { ReconhecedorFalso.ultimo!.onend?.() })
        expect(onFinal).not.toHaveBeenCalled()
    })

    it('encerra sozinho depois do silêncio — microfone aberto para sempre é o outro extremo', async () => {
        vi.useFakeTimers()
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        act(() => { result.current.iniciar() })
        await vi.waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())

        act(() => { ReconhecedorFalso.ultimo!.emitir('150g de arroz', true) })
        expect(ReconhecedorFalso.ultimo!.parouCom).toBe(0)
        act(() => { vi.advanceTimersByTime(SILENCIO_PARA_ENCERRAR_MS + 10) })
        expect(ReconhecedorFalso.ultimo!.parouCom).toBe(1)
        expect(onFinal).toHaveBeenCalledWith('150g de arroz')
    })

    it('permissão negada acende a flag que a tela usa para mandar às configurações', async () => {
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())

        act(() => { ReconhecedorFalso.ultimo!.onerror?.({ error: 'not-allowed' }) })
        expect(result.current.permissaoNegada).toBe(true)
        expect(result.current.erro).toMatch(/negada/i)
        expect(result.current.gravando).toBe(false)
    })

    it('sem API de voz no aparelho, avisa em vez de fingir que está ouvindo', async () => {
        delete (globalThis as unknown as Record<string, unknown>).SpeechRecognition
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })
        await waitFor(() => expect(result.current.erro).toMatch(/não suportado/i))
        expect(result.current.gravando).toBe(false)
    })
})

describe('ditado no iOS nativo', () => {
    beforeEach(() => {
        iosNativo = true
        requestVoicePermissions.mockResolvedValue({ microphone: 'granted', speechRecognition: 'granted' })
    })

    it('usa o SFSpeechRecognizer e entrega o resultado final', async () => {
        const onFinal = vi.fn()
        startNativeSpeechRecognition.mockImplementation(async (_lang: string, onResult: (t: string, f: boolean) => void) => {
            onResult('200g de patinho', true)
            return true
        })
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })

        await waitFor(() => expect(onFinal).toHaveBeenCalledWith('200g de patinho'))
        expect(startNativeSpeechRecognition).toHaveBeenCalled()
    })

    it('microfone negado nas configurações não vira "erro genérico"', async () => {
        requestVoicePermissions.mockResolvedValue({ microphone: 'denied', speechRecognition: 'granted' })
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })

        await waitFor(() => expect(result.current.permissaoNegada).toBe(true))
        expect(result.current.erro).toMatch(/microfone/i)
        expect(startNativeSpeechRecognition).not.toHaveBeenCalled()
    })

    it('se o nativo não subir, a WEB é a rede de segurança — não um erro', async () => {
        startNativeSpeechRecognition.mockResolvedValue(false)
        const onFinal = vi.fn()
        const { result } = renderHook(() => useSpeechToText({ onFinal }))
        await act(async () => { result.current.iniciar() })

        await waitFor(() => expect(ReconhecedorFalso.ultimo).toBeTruthy())
        act(() => { ReconhecedorFalso.ultimo!.emitir('uma banana', true) })
        act(() => { ReconhecedorFalso.ultimo!.onend?.() })
        expect(onFinal).toHaveBeenCalledWith('uma banana')
        expect(result.current.erro).toBe('')
    })
})
