/**
 * @module falaDaSerie
 *
 * Parser DETERMINÍSTICO de "100kg 12 repetições rpe 8" → { pesoKg, reps, rpe }.
 * Sem rede, sem IA — o dono decidiu isso no plano (`docs/plans/voz-na-serie.md`):
 * mandar cada série ao Gemini custaria dinheiro por série e somaria latência no
 * meio do treino, e o precedente de `parse-exercise-voice` já mostra que fala
 * livre em pt-BR dá para resolver com regra.
 *
 * ⚠️ **Este parser NÃO foi calibrado com transcript real.** O plano previa uma
 * Fase 0 — o dono ditando ~15 frases numa ferramenta de captura
 * (`/dashboard/voice-capture`) ANTES de escrever o parser — e ela foi pulada a
 * pedido dele ("implementação completa nessa rodada"). O que está aqui é
 * heurística sobre o formato do pedido original ("100kg – 12 repetições – rpe
 * 8") e variações razoáveis. `useDitadoDaSerie` grava telemetria do que o
 * reconhecedor devolveu e se o parser entendeu — é o substituto da Fase 0,
 * tarde e em produção em vez de cedo e descartável. Reabra este arquivo assim
 * que houver amostra real: é quase certo que existam formas de falar que ele
 * ainda não cobre.
 *
 * Campo não dito nunca vira zero — `Number('')` é 0 e essa armadilha já mordeu
 * `numeroFalado` (`vozDoCardio.ts`) e as recomendações de check-in deste app.
 */

/** O que o parser conseguiu extrair. Campo ausente = não foi dito. */
export interface FalaDaSerie {
  /** Peso em kg, já convertido (aceita vírgula/ponto). */
  pesoKg?: number
  /** Repetições. */
  reps?: number
  /** RPE (pode ter casa decimal — "oito e meio"). */
  rpe?: number
  /** "série 2" → 2 (1-based). Ausente = nenhuma série foi mencionada. */
  serie?: number
  /** Pelo menos um campo foi entendido. */
  entendeu: boolean
  /** O transcript original, para telemetria/depuração. */
  bruto: string
}

// ── Números por extenso, pt-BR, 0–999 + "e meio/meia" ───────────────────────
// Cobre o que se fala numa série de treino. Não cobre milhares (ninguém
// levanta "mil quilos") nem frações fora de meio.

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19,
}

const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90,
}

const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
}

const stripAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Consome uma sequência de palavras numéricas a partir de `tokens[i]` e
 * devolve o valor + quantos tokens consumiu. `null` se `tokens[i]` não começa
 * número nenhum.
 */
function consumirNumeroExtenso(tokens: string[], i: number): { valor: number; consumidos: number } | null {
  let idx = i
  let valor = 0
  let consumiuAlgo = false

  if (CENTENAS[tokens[idx]] !== undefined) {
    valor += CENTENAS[tokens[idx]]
    idx += 1
    consumiuAlgo = true
    if (tokens[idx] === 'e') idx += 1
    else if (valor === 100) {
      // "cem" sozinho = 100; sem "e" depois, não busca mais nada.
      return { valor, consumidos: idx - i }
    }
  }

  if (DEZENAS[tokens[idx]] !== undefined) {
    valor += DEZENAS[tokens[idx]]
    idx += 1
    consumiuAlgo = true
    if (tokens[idx] === 'e' && UNIDADES[tokens[idx + 1]] !== undefined) idx += 1
    else return consumiuAlgo ? { valor, consumidos: idx - i } : null
  }

  if (UNIDADES[tokens[idx]] !== undefined) {
    valor += UNIDADES[tokens[idx]]
    idx += 1
    consumiuAlgo = true
  }

  if (!consumiuAlgo) return null
  return { valor, consumidos: idx - i }
}

/**
 * Substitui números por extenso pela forma em dígitos, preservando o resto da
 * frase. "oitenta e dois e meio" → "82,5". "cento e vinte" → "120".
 */
export function numerosExtensoParaDigitos(texto: string): string {
  const normalizado = stripAcentos(texto.toLowerCase())
  const tokens = normalizado.split(/\s+/).filter(Boolean)
  const saida: string[] = []
  let i = 0

  while (i < tokens.length) {
    const num = consumirNumeroExtenso(tokens, i)
    if (!num) {
      saida.push(tokens[i])
      i += 1
      continue
    }
    let valor = num.valor
    let fim = i + num.consumidos
    // "e meio" / "e meia" — decimal de 0,5, comum em RPE e peso de anilha.
    if (tokens[fim] === 'e' && (tokens[fim + 1] === 'meio' || tokens[fim + 1] === 'meia')) {
      valor += 0.5
      fim += 2
    }
    saida.push(String(valor).replace('.', ','))
    i = fim
  }

  return saida.join(' ')
}

const paraNumero = (s: string): number | undefined => {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/**
 * Parseia a fala de uma série. Determinístico: mesma entrada, mesma saída.
 *
 * Peso exige marcador de unidade (kg/quilo/quilos) — um número solto na frase
 * é ambíguo demais para virar peso sem confirmação nenhuma (poderia ser o
 * número da série, ou reps ditas fora de ordem).
 */
export function falaDaSerie(transcriptBruto: string): FalaDaSerie {
  const bruto = String(transcriptBruto ?? '').trim()
  if (!bruto) return { entendeu: false, bruto }

  // Números por extenso → dígitos, ANTES de qualquer regex. Depois disso a
  // frase já fala "82,5" em vez de "oitenta e dois e meio".
  const t = numerosExtensoParaDigitos(bruto)

  const out: FalaDaSerie = { entendeu: false, bruto }

  const mSerie = t.match(/s[ée]rie\s*(\d+)/i)
  if (mSerie) {
    const n = paraNumero(mSerie[1])
    if (n !== undefined && n >= 1) { out.serie = n; out.entendeu = true }
  }

  const mPeso = t.match(/(\d+(?:,\d+)?)\s*(?:kg|kilos?|quilos?|quilo)\b/i)
  if (mPeso) {
    const n = paraNumero(mPeso[1])
    if (n !== undefined && n > 0) { out.pesoKg = n; out.entendeu = true }
  }

  const mReps = t.match(/(\d+)\s*(?:repeti[cç][oõ]es|repeti[cç][aã]o|reps?)\b/i)
  if (mReps) {
    const n = paraNumero(mReps[1])
    if (n !== undefined && n > 0) { out.reps = n; out.entendeu = true }
  }

  // "rpe 8" | "r p e 8" | "erre pê ê 8" (o jeito de FALAR a sigla) | "rpe: 8" /
  // "rpe de 8" (pontuação/conectivo que o reconhecedor às vezes insere) |
  // "8 de rpe" / "8 rpe" (ordem invertida). Achado real (19/09/2026): o RPE é
  // o campo que mais falha no uso — este regex é engenharia defensiva sobre
  // padrões plausíveis, NÃO calibrada com transcript real (a Fase 0 do plano
  // foi pulada). Reabrir assim que a telemetria/ferramenta de captura trouxer
  // o texto exato que falha.
  const SIGLA_RPE = '(?:rpe|r\\.?\\s*p\\.?\\s*e\\.?|erre\\s*p[eê]\\s*[eê]?)'
  let mRpe = t.match(new RegExp(`${SIGLA_RPE}\\s*(?:de\\s*)?[:\\-]?\\s*(\\d+(?:,\\d+)?)\\b`, 'i'))
  if (!mRpe) mRpe = t.match(new RegExp(`(\\d+(?:,\\d+)?)\\s*(?:de\\s*)?${SIGLA_RPE}\\b`, 'i'))
  if (mRpe) {
    const n = paraNumero(mRpe[1])
    if (n !== undefined && n >= 0 && n <= 10) { out.rpe = n; out.entendeu = true }
  }

  return out
}
