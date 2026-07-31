/**
 * Extração de JSON da resposta de um modelo de IA — fonte única.
 *
 * Este corpo estava duplicado byte-a-byte em três lugares (muscleMapWeekHelpers,
 * exerciseMuscleMapShared, lib/nutrition/aiEstimate). Modelos às vezes devolvem o
 * JSON embrulhado em prosa/```json; tenta parse direto e, se falhar, recorta do
 * primeiro `{` ao último `}`.
 *
 * TERCEIRA linha de defesa (jul/2026): REPARO sintático. Medido em produção — na
 * rota de correlação da avaliação por foto, ~2 em cada 3 respostas do Gemini
 * falhavam, e parte delas por JSON estruturalmente quebrado (o modelo esquecia o
 * `}` de um item de array: `"trend": "supported"\n , \n {`). Recortar do `{` ao
 * `}` não salva esse caso — só o reparo salva. O reparo NUNCA roda quando o JSON
 * já é válido, então é puro ganho: ou devolve objeto onde antes vinha `null`, ou
 * devolve `null` como antes.
 */
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'

export const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

/** Remove cercas markdown (```json … ```) que o modelo adiciona por conta própria. */
export const stripCodeFence = (text: string): string => {
  const cleaned = String(text || '').trim()
  const fenced = cleaned.match(/^```(?:json|JSON)?\s*\r?\n?([\s\S]*?)\r?\n?\s*```\s*$/)
  if (fenced?.[1]) return fenced[1].trim()
  // Cerca aberta sem fechamento (resposta cortada): remove só a abertura.
  if (/^```(?:json|JSON)?\s*\r?\n/.test(cleaned)) {
    return cleaned.replace(/^```(?:json|JSON)?\s*\r?\n/, '').replace(/\r?\n?\s*```\s*$/, '').trim()
  }
  return cleaned
}

const isWhitespace = (ch: string) => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t'

/**
 * Conserta os erros de sintaxe que modelos generativos cometem de fato:
 *  1. objeto de array não fechado antes da vírgula (`… "x": 1 , { …` → `… "x": 1 }, { …`);
 *  2. vírgula sobrando antes de `}` / `]`;
 *  3. vírgula FALTANDO entre itens consecutivos de um array (`} {` → `}, {`);
 *  4. string/containers abertos no fim (resposta truncada) — fecha o que ficou aberto.
 *
 * Não tenta ser um parser completo: o objetivo é recuperar o conteúdo, e o
 * `JSON.parse` seguinte continua sendo o juiz.
 */
export function repairJsonText(input: string): string {
  const src = String(input || '')
  const out: string[] = []
  const stack: Array<'{' | '['> = []
  let inString = false
  let escaped = false
  /** Último caractere significativo já emitido (ignora espaços). */
  let lastMeaningful = ''

  const nextMeaningful = (from: number): string => {
    for (let j = from; j < src.length; j++) {
      if (!isWhitespace(src[j])) return src[j]
    }
    return ''
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (inString) {
      out.push(ch)
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') { inString = false; lastMeaningful = '"' }
      continue
    }

    if (ch === '"') {
      // (3) faltou a vírgula entre dois itens de array
      if (stack[stack.length - 1] === '[' && (lastMeaningful === '}' || lastMeaningful === ']' || lastMeaningful === '"')) {
        out.push(',')
      }
      inString = true
      out.push(ch)
      lastMeaningful = '"'
      continue
    }

    if (isWhitespace(ch)) { out.push(ch); continue }

    if (ch === '{' || ch === '[') {
      // (3) faltou a vírgula entre dois itens de array
      if (stack[stack.length - 1] === '[' && (lastMeaningful === '}' || lastMeaningful === ']' || lastMeaningful === '"')) {
        out.push(',')
      }
      stack.push(ch)
      out.push(ch)
      lastMeaningful = ch
      continue
    }

    if (ch === '}' || ch === ']') {
      // (2) vírgula sobrando imediatamente antes do fechamento
      while (out.length && isWhitespace(out[out.length - 1])) out.pop()
      if (out[out.length - 1] === ',') out.pop()
      const expected = ch === '}' ? '{' : '['
      if (stack[stack.length - 1] === expected) stack.pop()
      out.push(ch)
      lastMeaningful = ch
      continue
    }

    if (ch === ',') {
      const next = nextMeaningful(i + 1)
      // (2) vírgula sobrando antes de `}` / `]`
      if (next === '}' || next === ']') continue
      // (1) item de array cujo objeto não foi fechado: `{ … , { …`
      if (stack[stack.length - 1] === '{' && (next === '{' || next === '[')) {
        out.push('}')
        stack.pop()
      }
      out.push(ch)
      lastMeaningful = ','
      continue
    }

    out.push(ch)
    lastMeaningful = ch
  }

  // (4) resposta truncada — fecha string e containers abertos
  if (inString) out.push('"')
  while (out.length && isWhitespace(out[out.length - 1])) out.pop()
  if (out[out.length - 1] === ',') out.pop()
  for (let i = stack.length - 1; i >= 0; i--) out.push(stack[i] === '{' ? '}' : ']')

  return out.join('')
}

/**
 * Extrai o objeto/array JSON de um texto de modelo. Ordem das tentativas:
 * parse direto → sem cerca markdown → recorte do primeiro `{`/`[` ao último
 * `}`/`]` → recorte reparado. Devolve `null` quando não sobra nada aproveitável.
 */
export const extractJsonFromModelText = (text: string) => {
  const cleaned = stripCodeFence(text)
  if (!cleaned) return null

  const direct = safeJsonParse(cleaned)
  if (direct) return direct

  const firstObj = cleaned.indexOf('{')
  const firstArr = cleaned.indexOf('[')
  const start = firstObj === -1 ? firstArr : (firstArr === -1 ? firstObj : Math.min(firstObj, firstArr))
  if (start === -1) return null
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  const sliced = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start)

  const parsed = safeJsonParse(sliced)
  if (parsed) return parsed

  return safeJsonParse(repairJsonText(sliced))
}
