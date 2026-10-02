import { describe, it, expect } from 'vitest'
import { sanitizeOverviewText } from '../periodizationOverviewText'

/**
 * O resumo aparecia na tela com a marcação crua (visto no simulador em
 * 26/09/2026): "**Programa de Periodização IronTracks: Hipertrofia Linear**",
 * com os asteriscos à vista. `VipPeriodizationPanel` renderizava
 * `String(config.overview)` direto, sem limpar o markdown que a IA devolve.
 */
describe('sanitizeOverviewText', () => {
  it('remove negrito **texto**', () => {
    expect(sanitizeOverviewText('**Programa de Periodização IronTracks: Hipertrofia Linear**')).toBe(
      'Programa de Periodização IronTracks: Hipertrofia Linear',
    )
  })

  it('remove negrito no meio de uma frase, preservando o resto', () => {
    expect(sanitizeOverviewText('Faça o **teste de carga máxima** na última semana.')).toBe(
      'Faça o teste de carga máxima na última semana.',
    )
  })

  it('converte marcador de lista "* item" em "• item"', () => {
    expect(sanitizeOverviewText('* Progrida a carga toda semana')).toBe('• Progrida a carga toda semana')
  })

  it('converte marcador de lista "- item" em "• item"', () => {
    expect(sanitizeOverviewText('- Respeite o descanso')).toBe('• Respeite o descanso')
  })

  it('remove cabeçalho markdown "# Título"', () => {
    expect(sanitizeOverviewText('## Programa Linear')).toBe('Programa Linear')
  })

  it('remove itálico _texto_ e *texto*', () => {
    expect(sanitizeOverviewText('Mantenha a *técnica* e o _foco_.')).toBe('Mantenha a técnica e o foco.')
  })

  it('limpa um resumo multi-linha real, com título, bullets e negrito', () => {
    const raw = [
      '**Programa de Periodização IronTracks: Hipertrofia Linear**',
      '',
      'Como funciona:',
      '* O modelo linear aumenta a intensidade a cada semana.',
      '* O volume cai nas semanas de deload.',
      '',
      'Deload e testes:',
      '* A semana 4 e a semana 6 são de deload.',
      '* A semana 8 é o teste de carga máxima.',
    ].join('\n')

    const clean = sanitizeOverviewText(raw)

    expect(clean).not.toContain('*')
    expect(clean).not.toContain('#')
    expect(clean).toContain('Programa de Periodização IronTracks: Hipertrofia Linear')
    expect(clean).toContain('• O modelo linear aumenta a intensidade a cada semana.')
    expect(clean).toContain('• A semana 4 e a semana 6 são de deload.')
  })

  it('texto já limpo passa intacto (idempotente)', () => {
    const clean = 'Programa de Periodização IronTracks: Hipertrofia Linear\n\nComo funciona: progressão semanal.'
    expect(sanitizeOverviewText(clean)).toBe(clean)
  })

  it('valor ausente devolve string vazia, sem lançar', () => {
    expect(sanitizeOverviewText(undefined)).toBe('')
    expect(sanitizeOverviewText(null)).toBe('')
  })
})
