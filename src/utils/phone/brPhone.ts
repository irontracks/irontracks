/**
 * Normalização de telefone brasileiro.
 *
 * Vivia em `lib/whatsapp/zapi.ts`. O sistema de WhatsApp foi removido
 * (ago/2026, decisão do dono: 2 conversas no total, a última em maio), mas esta
 * função continua sendo a validação de telefone da rota PÚBLICA de solicitação
 * de acesso — por isso mudou de casa em vez de sumir junto.
 */

/** Devolve E.164 sem o "+" (5511999999999), ou `null` se não for um número BR. */
export function normalizeBrPhone(raw: string): string | null {
    const digits = String(raw ?? '').replace(/\D/g, '')
    if (digits.length === 11) return `55${digits}`            // (11) 9xxxx-xxxx
    if (digits.length === 13 && digits.startsWith('55')) return digits
    if (digits.length === 12 && digits.startsWith('55')) return digits
    return null
}
