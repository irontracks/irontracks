/**
 * A voz reporta o DESFECHO, não o pedido.
 *
 * ⚠️ O invariante inteiro deste arquivo: **`speak()` voltar sem lançar não prova
 * que o aparelho falou.** A política de áudio do WebView pode aceitar o pedido e
 * engolir a fala, e aí a feature morre sem rastro — a saída silenciosa em
 * caminho crítico que este projeto já pagou caro para aprender a instrumentar.
 * Quem prova é o `onstart`; a AUSÊNCIA dele em três segundos é o sinal, e é o
 * caso `nao_comecou` abaixo que trava isso.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { falar, calar, vozDisponivel, type ResultadoDaFala } from '../voz'

type Falante = { onstart?: () => void; onerror?: (e: unknown) => void; text: string }

let falados: Falante[] = []
let cancelamentos = 0
let comportamento: 'inicia' | 'muda' | 'erro' = 'inicia'

function instalarSintetizador() {
  falados = []
  cancelamentos = 0
  class UtteranceFake {
    text: string
    lang = ''
    rate = 1
    volume = 1
    voice: unknown = null
    onstart?: () => void
    onerror?: (e: unknown) => void
    constructor(t: string) { this.text = t }
  }
  ;(globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = UtteranceFake
  ;(globalThis as unknown as Record<string, unknown>).window = globalThis
  ;(globalThis as unknown as Record<string, unknown>).speechSynthesis = {
    cancel: () => { cancelamentos += 1 },
    getVoices: () => [{ lang: 'pt-BR', name: 'Luciana' }, { lang: 'en-US', name: 'Sam' }],
    speak: (u: Falante) => {
      falados.push(u)
      if (comportamento === 'inicia') u.onstart?.()
      if (comportamento === 'erro') u.onerror?.({ error: 'not-allowed' })
      // 'muda': aceita e nunca chama nada — o caso que importa.
    },
  }
}

describe('falar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    comportamento = 'inicia'
    instalarSintetizador()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as Record<string, unknown>).speechSynthesis
    delete (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance
  })

  it('fala o texto e reporta que COMEÇOU', () => {
    const desfechos: ResultadoDaFala[] = []
    falar('15 minutos', { aoResolver: (r) => desfechos.push(r) })
    expect(falados.map((f) => f.text)).toEqual(['15 minutos'])
    expect(desfechos).toEqual(['iniciou'])
  })

  it('⚠️ aceitou e NUNCA falou: reporta nao_comecou em vez de fingir sucesso', () => {
    comportamento = 'muda'
    const desfechos: ResultadoDaFala[] = []
    const pediu = falar('15 minutos', { aoResolver: (r) => desfechos.push(r) })

    // O retorno é `true` — speak() não lançou. É exatamente por isso que ele
    // não serve de prova, e o desfecho ainda não chegou.
    expect(pediu).toBe(true)
    expect(desfechos).toEqual([])

    vi.advanceTimersByTime(3_000)
    expect(desfechos).toEqual(['nao_comecou'])
  })

  it('erro do sintetizador vira desfecho com o motivo', () => {
    comportamento = 'erro'
    const desfechos: Array<[ResultadoDaFala, string | undefined]> = []
    falar('oi', { aoResolver: (r, d) => desfechos.push([r, d]) })
    expect(desfechos).toEqual([['erro', 'not-allowed']])
  })

  it('o desfecho é reportado UMA vez — onstart atrasado não contradiz o timeout', () => {
    comportamento = 'muda'
    const desfechos: ResultadoDaFala[] = []
    falar('oi', { aoResolver: (r) => desfechos.push(r) })
    vi.advanceTimersByTime(3_000)
    // O sintetizador acorda tarde e avisa que começou:
    falados[0].onstart?.()
    expect(desfechos).toEqual(['nao_comecou'])
  })

  it('cancela a fila antes de falar — anúncio de treino é perecível', () => {
    falar('primeiro')
    falar('segundo')
    expect(cancelamentos).toBe(2)
    expect(falados.map((f) => f.text)).toEqual(['primeiro', 'segundo'])
  })

  it('texto vazio não vira fala', () => {
    expect(falar('   ')).toBe(false)
    expect(falados).toHaveLength(0)
  })

  it('sem API no aparelho: reporta sem_suporte e não lança', () => {
    delete (globalThis as unknown as Record<string, unknown>).speechSynthesis
    const desfechos: ResultadoDaFala[] = []
    expect(falar('oi', { aoResolver: (r) => desfechos.push(r) })).toBe(false)
    expect(desfechos).toEqual(['sem_suporte'])
    expect(vozDisponivel()).toBe(false)
  })

  it('escolhe a voz pt-BR quando existe', () => {
    falar('oi')
    expect((falados[0] as unknown as { voice: { lang: string } }).voice.lang).toBe('pt-BR')
  })

  it('calar não explota sem API', () => {
    delete (globalThis as unknown as Record<string, unknown>).speechSynthesis
    expect(() => calar()).not.toThrow()
  })
})
