/**
 * Degustação: o painel precisa dizer o que está VALENDO, não o que foi dado.
 *
 * O histórico mostrava "30 dia(s)" — o que o admin concedeu na época. A
 * pergunta que ele faz ao abrir a tela é outra: quanto ainda resta?
 *
 * Calcular por `created_at + days` seria inventar um fato. Medido na base em
 * 13/08/2026: um usuário recebeu 30 dias em 22/06 e o entitlement venceu em
 * 22/07; outro tem TRÊS registros ao mesmo tempo — válido até 2027, vencido há
 * 96 dias, e inativo. A conta pelo log erraria os três, com cara de precisão.
 *
 * A verdade é `user_entitlements.valid_until`, e é a rota que a resolve — o
 * cliente não calcula nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trialStatus, trialStatusLabel } from '../trialStatus'

const HOJE = new Date('2026-08-13T12:00:00Z')

describe('trialStatus', () => {
  it('ativo conta os dias que faltam', () => {
    const s = trialStatus({ validUntil: '2027-06-12T00:00:00Z', status: 'active' }, HOJE)
    expect(s).toEqual({ tipo: 'ativo', diasRestantes: 303 })
    expect(trialStatusLabel(s)).toBe('Faltam 303 dias')
  })

  it('expirado diz há quanto tempo — o caso real do print', () => {
    // joshimajr: 30 dias concedidos em 22/06, venceu em 22/07.
    const s = trialStatus({ validUntil: '2026-07-22T00:00:00Z', status: 'active' }, HOJE)
    expect(s).toEqual({ tipo: 'expirado', diasAtras: 22 })
    expect(trialStatusLabel(s)).toBe('Expirou há 22 dias')
  })

  it('vencer HOJE ainda é hoje — 0 não é expirado', () => {
    const s = trialStatus({ validUntil: '2026-08-13T23:00:00Z', status: 'active' }, HOJE)
    expect(s).toEqual({ tipo: 'ativo', diasRestantes: 0 })
    expect(trialStatusLabel(s)).toBe('Vence hoje')
  })

  it('revogado corta ANTES da data — é decisão explícita', () => {
    const s = trialStatus({ validUntil: '2027-01-01T00:00:00Z', status: 'revoked' }, HOJE)
    expect(s).toEqual({ tipo: 'revogado' })
  })

  it('sem valid_until é acesso sem prazo, não erro', () => {
    expect(trialStatus({ validUntil: null, status: 'active' }, HOJE)).toEqual({ tipo: 'sem-prazo' })
  })

  it('sem entitlement nenhum não inventa estado', () => {
    expect(trialStatus(null, HOJE)).toEqual({ tipo: 'desconhecido' })
    expect(trialStatusLabel({ tipo: 'desconhecido' })).toBe('Sem VIP ativo')
  })

  it('plural correto — nunca "1 dia(s)"', () => {
    expect(trialStatusLabel({ tipo: 'ativo', diasRestantes: 1 })).toBe('Falta 1 dia')
    expect(trialStatusLabel({ tipo: 'expirado', diasAtras: 1 })).toBe('Expirou ontem')
  })
})

describe('fiação — quem resolve o estado é a ROTA, não a tela', () => {
  const rota = readFileSync(join('src', 'app', 'api', 'admin', 'vip', 'grant-history', 'route.ts'), 'utf8')
  const tela = readFileSync(join('src', 'components', 'admin-panel', 'SystemTab.tsx'), 'utf8')

  it('a rota lê user_entitlements e devolve o vigente', () => {
    expect(rota).toContain("from('user_entitlements')")
    expect(rota).toMatch(/vigente/)
  })

  it('a tela não deriva vencimento do log', () => {
    // `created_at + days` no cliente seria o fato inventado.
    expect(tela).not.toMatch(/createdAt[\s\S]{0,80}\+\s*days/)
    expect(tela).toContain('trialStatus(')
  })

  it('a data do log não vai crua para a tela', () => {
    expect(tela).toContain('formatarData(')
    expect(tela).not.toMatch(/>\{createdAt\}</)
  })

  it('não sobrou "dia(s)" em lugar nenhum', () => {
    expect(tela).not.toContain('dia(s)')
  })
})
