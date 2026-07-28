/**
 * `external_reference` — o único elo entre quem cobra e quem libera acesso.
 *
 * Bug real que motivou este arquivo (28/07/2026): o checkout do aluno escrevia
 * `student_plan:professor:plano:aluno:assinatura` e o webhook lia a assinatura
 * da posição 3 — que é o ID do aluno. O pagamento aprovado atualizava
 * `student_subscriptions` com `.eq('id', <id do aluno>)`, que não casa com
 * nada: o aluno pagava e a assinatura seguia pendente. Nunca queimou ninguém
 * porque o fluxo ainda não tinha uso em produção (0 assinaturas, 0 cobranças).
 *
 * O guard que importa aqui é o de IDA E VOLTA: montar com o builder e ler com o
 * parser tem que devolver exatamente os mesmos campos. É isso que impede as
 * duas pontas de divergirem de novo — checar só o parser deixaria passar uma
 * mudança de formato no builder.
 */
import { describe, it, expect } from 'vitest'
import {
  buildVipReference,
  buildTeacherPlanReference,
  buildStudentPlanReference,
  parseExternalReference,
} from '../mercadopagoWebhookRules'

describe('external_reference — ida e volta', () => {
  it('vip: o que o checkout escreve é o que o webhook lê', () => {
    const ref = buildVipReference('user-1', 'plan-vip-anual')
    expect(parseExternalReference(ref)).toEqual({
      scope: 'vip',
      userId: 'user-1',
      planId: 'plan-vip-anual',
    })
  })

  it('teacher_plan: o que o checkout escreve é o que o webhook lê', () => {
    const ref = buildTeacherPlanReference('user-prof', 'pro')
    expect(parseExternalReference(ref)).toEqual({
      scope: 'teacher_plan',
      userId: 'user-prof',
      tierKey: 'pro',
    })
  })

  // ESTE é o caso que estava quebrado.
  it('student_plan: a assinatura lida é a assinatura cobrada, não o aluno', () => {
    const ref = buildStudentPlanReference({
      teacherUserId: 'prof-1',
      planId: 'plano-mensal',
      studentUserId: 'aluno-1',
      subscriptionId: 'assinatura-1',
    })

    const parsed = parseExternalReference(ref)

    expect(parsed).toEqual({
      scope: 'student_plan',
      teacherUserId: 'prof-1',
      planId: 'plano-mensal',
      studentUserId: 'aluno-1',
      subscriptionId: 'assinatura-1',
    })
    // Explícito porque é exatamente a troca que causou o bug:
    expect((parsed as { subscriptionId: string }).subscriptionId).not.toBe('aluno-1')
  })

  it('student_plan com UUIDs reais (o formato de produção)', () => {
    const ids = {
      teacherUserId: '11111111-1111-4111-8111-111111111111',
      planId: '22222222-2222-4222-8222-222222222222',
      studentUserId: '33333333-3333-4333-8333-333333333333',
      subscriptionId: '44444444-4444-4444-8444-444444444444',
    }
    expect(parseExternalReference(buildStudentPlanReference(ids))).toEqual({ scope: 'student_plan', ...ids })
  })
})

describe('parseExternalReference — entradas degeneradas', () => {
  it('escopo desconhecido não vira acesso', () => {
    expect(parseExternalReference('qualquer_coisa:1:2')).toEqual({ scope: 'unknown', raw: 'qualquer_coisa:1:2' })
  })

  it('vazio, nulo e lixo caem em unknown', () => {
    for (const v of ['', null, undefined, 42, {}]) {
      expect(parseExternalReference(v).scope).toBe('unknown')
    }
  })

  it('escopo sem id de usuário cai em unknown (não concede às cegas)', () => {
    expect(parseExternalReference('vip:').scope).toBe('unknown')
    expect(parseExternalReference('teacher_plan').scope).toBe('unknown')
    expect(parseExternalReference('student_plan::::').scope).toBe('unknown')
  })

  it('student_plan truncado devolve campos vazios em vez de deslocar posições', () => {
    // Um campo faltando não pode virar "o próximo campo assume o lugar" — foi
    // essa classe de deslocamento que gerou o bug original.
    expect(parseExternalReference('student_plan:prof-1:plano-1')).toEqual({
      scope: 'student_plan',
      teacherUserId: 'prof-1',
      planId: 'plano-1',
      studentUserId: '',
      subscriptionId: '',
    })
  })
})
