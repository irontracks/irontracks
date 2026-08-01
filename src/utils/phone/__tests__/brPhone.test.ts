import { describe, it, expect } from 'vitest'
import { normalizeBrPhone } from '@/utils/phone/brPhone'

/**
 * Esta função é a validação de telefone da rota PÚBLICA de solicitação de
 * acesso (`/api/access-request/create` recusa o cadastro quando ela devolve
 * `null`). Morava dentro do cliente de WhatsApp e nunca teve teste; quando o
 * sistema de WhatsApp foi removido (ago/2026) ela mudou de casa e ganhou um.
 */
describe('normalizeBrPhone', () => {
    it('celular com DDD vira E.164 sem o +', () => {
        expect(normalizeBrPhone('(41) 99894-9082')).toBe('5541998949082')
        expect(normalizeBrPhone('41998949082')).toBe('5541998949082')
    })

    it('aceita número que já vem com o 55', () => {
        expect(normalizeBrPhone('5541998949082')).toBe('5541998949082')
        // fixo/antigo, sem o 9: 12 dígitos
        expect(normalizeBrPhone('554133334444')).toBe('554133334444')
    })

    it('ignora máscara, espaço e +', () => {
        expect(normalizeBrPhone('+55 (41) 99894-9082')).toBe('5541998949082')
    })

    it('recusa o que não é telefone BR — é o que barra cadastro inválido', () => {
        expect(normalizeBrPhone('')).toBeNull()
        expect(normalizeBrPhone('123')).toBeNull()
        expect(normalizeBrPhone('abcdefghijk')).toBeNull()
        // 13 dígitos sem começar com 55 não é BR
        expect(normalizeBrPhone('1234567890123')).toBeNull()
    })

    it('não quebra com entrada nula', () => {
        expect(normalizeBrPhone(null as unknown as string)).toBeNull()
        expect(normalizeBrPhone(undefined as unknown as string)).toBeNull()
    })
})
