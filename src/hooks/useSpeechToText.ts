/**
 * useSpeechToText — ditado por voz, em UMA implementação.
 *
 * Nasceu extraído do `VoiceWorkoutModal`, onde estas ~180 linhas viviam inline.
 * O lançamento de refeição por voz (28/08/2026) precisava exatamente do mesmo
 * ciclo, e copiar seria a deriva que este repo já pagou caro em outras áreas:
 * duas cópias divergem em silêncio, e aqui a divergência custaria o microfone
 * parar de funcionar num dos dois sem ninguém notar.
 *
 * ── DOIS CAMINHOS, E NENHUM É OPCIONAL ────────────────────────────────────
 *  • **iOS nativo** usa `SFSpeechRecognizer` pela ponte do Capacitor. O
 *    `webkitSpeechRecognition` até EXISTE no WKWebView (medido em 28/08/2026:
 *    o app pede as duas permissões e alcança o caminho nativo), mas é instável
 *    ali — daí o nativo ser o preferido, com a web como rede de segurança se
 *    ele não iniciar.
 *  • **Web** usa `SpeechRecognition`/`webkitSpeechRecognition`, precedido de um
 *    `getUserMedia` só para o navegador exibir o pedido de permissão no momento
 *    certo (sem ele o prompt aparece dentro do reconhecimento, e o usuário vê
 *    um erro genérico em vez da pergunta).
 *
 * ── DECISÕES QUE PARECEM DETALHE E NÃO SÃO ────────────────────────────────
 *  • O texto final vai para um **ref** antes de virar estado. O código original
 *    lia o transcript de um `<input type="hidden">` pelo `getElementById`,
 *    porque o callback `onend` do reconhecedor carrega uma closure velha e via
 *    o estado vazio. O ref resolve a mesma corrida sem pendurar um elemento no
 *    DOM só para transportar string.
 *  • **Auto-parada por silêncio** (3 s): quem dita "150g de arroz e 200g de
 *    patinho" faz pausa entre os itens; parar no primeiro silêncio curto
 *    cortaria a frase no meio, e não parar nunca deixaria o microfone aberto.
 *  • O hook **não decide o que fazer com o texto** — devolve por `onFinal`.
 *    Treino manda para o parser de exercícios; nutrição joga no campo da
 *    refeição. Misturar as duas coisas aqui é o que impediria o reuso.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    requestVoicePermissions,
    startNativeSpeechRecognition,
    stopNativeSpeechRecognition,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

interface ISpeechRecognitionEvent {
    resultIndex: number
    results: { isFinal: boolean;[k: number]: { transcript: string }; length: number }[]
}

interface ISpeechRecognition {
    lang: string
    continuous: boolean
    interimResults: boolean
    start: () => void
    stop: () => void
    abort: () => void
    onstart: (() => void) | null
    onresult: ((e: ISpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    onerror: ((e: { error?: string; message?: string }) => void) | null
}

type ISpeechRecognitionCtor = new () => ISpeechRecognition

/** Silêncio que encerra o ditado. Ver a nota de cabeçalho. */
export const SILENCIO_PARA_ENCERRAR_MS = 3000

export interface UseSpeechToTextOptions {
    /** Chamado com o texto final, já aparado. Nunca recebe string vazia. */
    onFinal: (texto: string) => void
    /** Idioma do reconhecedor. */
    lang?: string
}

export interface SpeechToText {
    gravando: boolean
    /** O que o reconhecedor ainda está decidindo — some quando vira final. */
    parcial: string
    erro: string
    /** O usuário negou microfone ou reconhecimento de voz nas configurações. */
    permissaoNegada: boolean
    iniciar: () => void
    parar: () => void
    limparErro: () => void
}

/** Mensagem para cada código de erro da Web Speech API. */
export function mensagemDeErroDeVoz(codigo: string): string {
    switch (codigo) {
        case 'not-allowed':
        case 'service-not-allowed':
            return 'Permissão de reconhecimento de voz negada. Habilite o microfone e o reconhecimento de voz nas configurações do dispositivo.'
        case 'no-speech':
            return 'Nenhuma fala detectada. Tente novamente.'
        case 'network':
            return 'Erro de rede. Verifique sua conexão.'
        default:
            return `Erro no reconhecimento de voz (${codigo || 'unknown'}). Tente novamente.`
    }
}

/** O código de erro significa "o usuário negou a permissão". */
export const ehPermissaoNegada = (codigo: string): boolean =>
    codigo === 'not-allowed' || codigo === 'service-not-allowed'

export function useSpeechToText({ onFinal, lang = 'pt-BR' }: UseSpeechToTextOptions): SpeechToText {
    const [gravando, setGravando] = useState(false)
    const [parcial, setParcial] = useState('')
    const [erro, setErro] = useState('')
    const [permissaoNegada, setPermissaoNegada] = useState(false)

    const reconhecedorRef = useRef<ISpeechRecognition | null>(null)
    const silencioRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const nativoAtivoRef = useRef(false)
    /** Texto final acumulado — ver a nota sobre a closure do `onend`. */
    const textoRef = useRef('')
    /**
     * `onFinal` sempre fresco: o callback do reconhecedor sobrevive a renders e
     * enxergaria a versão velha. Atribuído em EFEITO, não no corpo — escrever em
     * ref durante o render é o que o `react-hooks` proíbe, e com razão.
     */
    const onFinalRef = useRef(onFinal)
    useEffect(() => { onFinalRef.current = onFinal }, [onFinal])

    const limparSilencio = () => {
        if (silencioRef.current) {
            clearTimeout(silencioRef.current)
            silencioRef.current = null
        }
    }

    const entregar = useCallback(() => {
        const texto = textoRef.current.trim()
        textoRef.current = ''
        setParcial('')
        setGravando(false)
        if (texto) onFinalRef.current(texto)
    }, [])

    useEffect(() => {
        return () => {
            limparSilencio()
            try { reconhecedorRef.current?.abort() } catch { /* já encerrado */ }
            if (nativoAtivoRef.current) {
                void stopNativeSpeechRecognition()
                nativoAtivoRef.current = false
            }
        }
    }, [])

    const parar = useCallback(() => {
        limparSilencio()
        if (nativoAtivoRef.current) {
            void stopNativeSpeechRecognition()
            nativoAtivoRef.current = false
            entregar()
            return
        }
        try { reconhecedorRef.current?.stop() } catch { /* já encerrado */ }
        setGravando(false)
    }, [entregar])

    const iniciarWeb = useCallback(() => {
        const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
        const Ctor: ISpeechRecognitionCtor | null =
            (win?.SpeechRecognition as ISpeechRecognitionCtor | undefined) ||
            (win?.webkitSpeechRecognition as ISpeechRecognitionCtor | undefined) ||
            null
        if (!Ctor) {
            setErro('Reconhecimento de voz não suportado neste dispositivo.')
            return
        }

        textoRef.current = ''
        setParcial('')
        setErro('')

        const rec = new Ctor()
        rec.lang = lang
        rec.continuous = true
        rec.interimResults = true
        reconhecedorRef.current = rec

        rec.onstart = () => setGravando(true)

        rec.onresult = (e) => {
            limparSilencio()
            let final = ''
            let interim = ''
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i]
                if (r.isFinal) final += r[0].transcript
                else interim += r[0].transcript
            }
            if (final) textoRef.current += final
            setParcial(interim)
            silencioRef.current = setTimeout(() => {
                try { rec.stop() } catch { /* já encerrado */ }
            }, SILENCIO_PARA_ENCERRAR_MS)
        }

        rec.onend = () => {
            limparSilencio()
            entregar()
        }

        rec.onerror = (e) => {
            const codigo = e?.error || ''
            setGravando(false)
            if (ehPermissaoNegada(codigo)) setPermissaoNegada(true)
            setErro(mensagemDeErroDeVoz(codigo))
        }

        try {
            rec.start()
        } catch {
            setGravando(false)
            setPermissaoNegada(true)
            setErro('Não foi possível iniciar o reconhecimento de voz. Verifique as permissões de microfone e reconhecimento de voz.')
        }
    }, [entregar, lang])

    const iniciar = useCallback(() => {
        setPermissaoNegada(false)
        setErro('')

        if (isIosNative()) {
            void requestVoicePermissions().then(async (status) => {
                if (status.microphone === 'denied') {
                    setPermissaoNegada(true)
                    setErro('Permissão de microfone negada. Habilite nas configurações do dispositivo.')
                    return
                }
                if (status.speechRecognition === 'denied') {
                    setPermissaoNegada(true)
                    setErro('Permissão de reconhecimento de voz negada. Habilite nas configurações do dispositivo.')
                    return
                }

                textoRef.current = ''
                setParcial('')
                setGravando(true)
                nativoAtivoRef.current = true

                const iniciou = await startNativeSpeechRecognition(
                    lang,
                    (transcript, isFinal) => {
                        textoRef.current = transcript
                        if (isFinal) {
                            limparSilencio()
                            nativoAtivoRef.current = false
                            entregar()
                            return
                        }
                        setParcial(transcript)
                        limparSilencio()
                        silencioRef.current = setTimeout(() => {
                            void stopNativeSpeechRecognition()
                            nativoAtivoRef.current = false
                            entregar()
                        }, SILENCIO_PARA_ENCERRAR_MS)
                    },
                    (mensagem) => {
                        nativoAtivoRef.current = false
                        setGravando(false)
                        setErro(`Erro no reconhecimento de voz: ${mensagem}`)
                    },
                )

                // O nativo não subiu: a web é a rede de segurança, não um erro.
                if (!iniciou) {
                    nativoAtivoRef.current = false
                    iniciarWeb()
                }
            })
            return
        }

        // Web: o `getUserMedia` existe para o navegador PERGUNTAR no momento
        // certo. Sem ele o pedido nasce dentro do reconhecedor e o usuário
        // recebe um erro genérico em vez da pergunta.
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((stream) => {
                    stream.getTracks().forEach((t) => t.stop())
                    iniciarWeb()
                })
                .catch((err: unknown) => {
                    const negou =
                        (err instanceof DOMException &&
                            (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) ||
                        (err instanceof Error && err.name === 'NotAllowedError')
                    if (negou) {
                        setPermissaoNegada(true)
                        setErro('Permissão de microfone negada. Habilite nas configurações do navegador.')
                        return
                    }
                    // Falhou por outro motivo (sem placa de áudio, por exemplo).
                    // O reconhecedor pode funcionar mesmo assim.
                    iniciarWeb()
                })
            return
        }

        iniciarWeb()
    }, [entregar, iniciarWeb, lang])

    const limparErro = useCallback(() => setErro(''), [])

    return { gravando, parcial, erro, permissaoNegada, iniciar, parar, limparErro }
}
