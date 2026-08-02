/**
 * Coerção de saída de IA — "normalize, depois valide".
 *
 * Por que existe: schemas Zod com `.max(n)` são contrato de ARMAZENAMENTO, não
 * instrução que o modelo enxerga. Medido em produção (jul/2026, rota de
 * correlação da avaliação por foto): mesmo com structured output nativo do
 * Gemini (`responseSchema` com `maxLength`), o modelo estoura o limite em ~1 a
 * cada 5 respostas — e o `safeParse` jogava fora um laudo inteiro por causa de
 * 40 caracteres a mais num único campo. Rejeitar era a decisão errada: o
 * conteúdo é texto para humano ler; truncar preserva o valor e mantém o
 * contrato do banco.
 *
 * Uso: normalize o objeto cru com estes helpers e SÓ ENTÃO rode o schema
 * estrito. Se o schema ainda reprovar depois disso, é erro de verdade.
 */

/** Texto: aceita número/boolean, apara e trunca no limite (sem cortar no meio de palavra quando dá). */
export function clampText(raw: unknown, max: number, fallback = ''): string {
    if (raw == null) return fallback
    const s = (typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '').trim()
    if (!s) return fallback
    if (s.length <= max) return s
    const hard = s.slice(0, max)
    // Corta na última fronteira de palavra se ela não descartar muito texto.
    const soft = hard.slice(0, hard.lastIndexOf(' '))
    return (soft.length >= max * 0.7 ? soft : hard).trimEnd()
}

/** Enum: devolve o valor se for um dos permitidos, senão o fallback. */
export function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
    const s = String(raw ?? '').trim().toLowerCase()
    return (allowed as readonly string[]).includes(s) ? (s as T) : fallback
}

/** Número: coage string→number, trava no intervalo, arredonda se pedido. */
export function clampNumber(raw: unknown, min: number, max: number, fallback: number, round = false): number {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.').trim())
    if (!Number.isFinite(n)) return fallback
    const v = Math.min(max, Math.max(min, n))
    return round ? Math.round(v) : v
}

/** Lista: garante array, mapeia cada item, descarta vazios e corta no máximo. */
export function clampList<T>(raw: unknown, max: number, map: (item: unknown, index: number) => T | null): T[] {
    if (!Array.isArray(raw)) return []
    const out: T[] = []
    for (let i = 0; i < raw.length && out.length < max; i++) {
        const v = map(raw[i], i)
        if (v !== null && v !== undefined) out.push(v)
    }
    return out
}

/** Lista de textos — o caso mais comum (bullets do laudo). */
export function clampTextList(raw: unknown, maxItems: number, maxChars: number): string[] {
    return clampList(raw, maxItems, (item) => {
        const s = clampText(item, maxChars)
        return s ? s : null
    })
}
