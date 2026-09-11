/**
 * A fala do app (Web Speech / `speechSynthesis`).
 *
 * Primeira vez que o IronTracks EMITE fala: até aqui o app só tinha o caminho
 * inverso (`SFSpeechRecognizer`, fala→texto, no plugin nativo) e um WAV
 * pré-gravado para o alarme do descanso. Nada de texto dinâmico falado.
 *
 * ⚠️ **Isto só fala com o app NA FRENTE e a tela ligada.** Com a tela bloqueada
 * o WKWebView é suspenso e nenhum JS roda — o único som possível ali é uma
 * notificação local com áudio embarcado, agendada de antemão, que por definição
 * não serve para texto que muda. Não existe conserto deste lado: dependeria de
 * `audio` em `UIBackgroundModes`, que o dono avaliou e decidiu não adotar
 * (custo de build nativa, bateria e o foco de áudio que já roubou o Spotify uma
 * vez). Quem usa põe o celular no suporte da esteira; no bolso, não ouve.
 *
 * Escolhas que a versão ingênua erra:
 *
 * - **Cancelar antes de falar.** Anúncio de treino é perecível: ouvir "dez
 *   minutos" quando o relógio já passou de quinze é pior que silêncio. A fila
 *   padrão do `speechSynthesis` empilha, então ela é esvaziada a cada anúncio.
 * - **Nunca lançar.** Roda no meio do treino; uma exceção aqui derrubaria a
 *   tela do cardio por causa de um enfeite sonoro.
 * - **Voz pt-BR quando houver.** Sem `lang`, o sintetizador lê "5 minutos" com
 *   fonética inglesa. A lista de vozes chega ASSÍNCRONA no WebKit (vem vazia na
 *   primeira chamada), por isso ela é relida a cada fala em vez de cacheada no
 *   carregamento do módulo.
 */

const PT_BR = 'pt-BR'

type Sintetizador = {
  speak: (u: SpeechSynthesisUtterance) => void
  cancel: () => void
  getVoices: () => SpeechSynthesisVoice[]
}

function sintetizador(): Sintetizador | null {
  try {
    if (typeof window === 'undefined') return null
    const s = (window as unknown as { speechSynthesis?: Sintetizador }).speechSynthesis
    if (!s || typeof s.speak !== 'function') return null
    if (typeof window.SpeechSynthesisUtterance !== 'function') return null
    return s
  } catch {
    return null
  }
}

/** O aparelho consegue falar? Usado para não oferecer a opção onde ela é inerte. */
export function vozDisponivel(): boolean {
  return sintetizador() !== null
}

function escolherVoz(s: Sintetizador): SpeechSynthesisVoice | null {
  try {
    const vozes = s.getVoices()
    if (!Array.isArray(vozes) || vozes.length === 0) return null
    return (
      vozes.find((v) => v.lang === PT_BR) ??
      vozes.find((v) => String(v.lang || '').toLowerCase().startsWith('pt')) ??
      null
    )
  } catch {
    return null
  }
}

export interface OpcoesDeFala {
  /** 0.1–10; abaixo de 1 fica mais devagar. Na academia, ~1 lê bem. */
  velocidade?: number
  /** 0–1. */
  volume?: number
}

/**
 * Fala um texto curto. Silencioso e sem efeito quando o aparelho não sintetiza.
 * Devolve `true` quando chegou a PEDIR a fala — não é garantia de som audível
 * (volume do aparelho, sessão de áudio e modo silencioso ficam fora do alcance
 * do JS).
 */
export function falar(texto: string, opcoes?: OpcoesDeFala): boolean {
  const limpo = String(texto ?? '').trim()
  if (!limpo) return false
  const s = sintetizador()
  if (!s) return false
  try {
    s.cancel()
    const u = new SpeechSynthesisUtterance(limpo)
    u.lang = PT_BR
    const voz = escolherVoz(s)
    if (voz) u.voice = voz
    const vel = Number(opcoes?.velocidade)
    u.rate = Number.isFinite(vel) && vel > 0 ? Math.min(10, Math.max(0.1, vel)) : 1
    const vol = Number(opcoes?.volume)
    u.volume = Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1
    s.speak(u)
    return true
  } catch {
    return false
  }
}

/** Cala a boca imediatamente (fim do exercício, saída da tela). */
export function calar(): void {
  try {
    sintetizador()?.cancel()
  } catch { /* silenced */ }
}
