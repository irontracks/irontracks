import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brToIsoDate, formatBrazilDate, friendlyCreateError, DEFAULT_PERIODIZATION_FORM } from '../PeriodizationCreateModal'

/**
 * "Crie sua periodização na aba VIP para ela aparecer aqui."
 *
 * Era o que a aba Periodizados dizia a quem chegava nela querendo um programa: saia
 * daqui, ache a aba VIP, role até o painel, crie — e volte. O dono apontou isso em
 * 04/08/2026 como o exemplo do problema que ele quer varrido do app: a ação não mora
 * onde a falta dela é percebida.
 *
 * Estes guards travam as duas metades da correção: a ação está na tela onde faz
 * falta, e o formulário é UM SÓ (extraído, não copiado).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const dashboard = read('src/components/dashboard/StudentDashboard.tsx')
const panel = read('src/components/vip/VipPeriodizationPanel.tsx')
const modal = read('src/components/vip/PeriodizationCreateModal.tsx')

/** Invariante de fluxo se mede em código, não na prosa que o explica. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('a criação acontece na própria tela de treinos', () => {
  it('o vazio da aba não manda mais o usuário para a aba VIP', () => {
    expect(code(dashboard)).not.toContain('na aba VIP')
  })

  it('a tela renderiza o criador de periodização', () => {
    expect(dashboard).toContain('PeriodizationCreateModal')
    expect(code(dashboard)).toContain('setPeriodizationCreateOpen(true)')
  })

  it('quem NÃO é VIP é levado ao plano, não a um formulário que vai falhar', () => {
    expect(code(dashboard)).toMatch(/vipLocked \? props\.onChangeView\('vip'\) : setPeriodizationCreateOpen\(true\)/)
  })

  it('criar recarrega a lista sem o usuário sair e voltar', () => {
    const bloco = dashboard.slice(dashboard.indexOf('<PeriodizationCreateModal'), dashboard.indexOf('<CheckinsModal'))
    expect(bloco).toContain('setPeriodizedLoaded(false)')
  })
})

describe('um formulário só — extraído, não copiado', () => {
  it('o painel VIP usa o MESMO componente', () => {
    expect(panel).toContain("from '@/components/vip/PeriodizationCreateModal'")
    expect(panel).toContain('<PeriodizationCreateModal')
  })

  it('o painel não guarda mais uma cópia do formulário', () => {
    // Os campos moram só no modal. Se voltarem para cá, são duas telas divergindo.
    for (const marca of ['Duração do programa', 'Modelo de progressão', 'Equipamentos disponíveis', 'dd/mm/aaaa']) {
      expect(panel).not.toContain(marca)
    }
    expect(code(panel)).not.toContain('setForm(')
  })

  it('a chamada de criação existe uma vez só, dentro do modal', () => {
    expect(modal).toContain('apiVip.createPeriodization')
    expect(code(panel)).not.toContain('createPeriodization')
  })
})

describe('as regras do formulário seguem valendo depois da extração', () => {
  it('a máscara de data continua dd/mm/aaaa', () => {
    expect(formatBrazilDate('01082026')).toBe('01/08/2026')
    expect(formatBrazilDate('0108')).toBe('01/08')
  })

  it('data que não existe no calendário é recusada', () => {
    expect(brToIsoDate('04/08/2026')).toBe('2026-08-04')
    expect(brToIsoDate('31/02/2026')).toBeNull()
    expect(brToIsoDate('1/8/26')).toBeNull()
    expect(brToIsoDate('')).toBeNull()
  })

  it('erro da rota vira frase que o usuário entende', () => {
    expect(friendlyCreateError('vip_required')).toBe('Disponível apenas no VIP pago.')
    expect(friendlyCreateError('')).toBe('Falha ao criar periodização.')
  })

  it('os defaults do formulário são utilizáveis sem tocar em nada', () => {
    expect(DEFAULT_PERIODIZATION_FORM.weeks).toBe(6)
    expect(DEFAULT_PERIODIZATION_FORM.daysPerWeek).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_PERIODIZATION_FORM.daysPerWeek).toBeLessThanOrEqual(6)
    expect(DEFAULT_PERIODIZATION_FORM.equipment).toContain('gym')
  })
})
