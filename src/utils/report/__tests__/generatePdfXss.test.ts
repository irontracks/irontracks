/**
 * Guard da auditoria 2026-08-13 (SEC-01): o HTML do relatório de avaliação é
 * entregue a document.write() numa janela nova — qualquer string não escapada
 * vira XSS executável com acesso ao opener e à origem.
 *
 * O caminho do ataque é CROSS-USER: `studentName` vem de
 * `selectedStudent.name` no painel do professor (StudentEvolutionTab), ou
 * seja, o ALUNO controla o valor e o PROFESSOR abre o documento. Observações
 * e classificações vêm de dados persistidos.
 *
 * A correção escapa NA ATRIBUIÇÃO (name, date, classificações, observations)
 * — este teste injeta payload em cada campo textual e exige que ele saia como
 * texto literal, nunca como tag.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

import { buildAssessmentHtml } from '@/utils/report/generatePdf'

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '</style><script>alert(1)</script>',
  `"onmouseover="alert(1)`,
  `'onfocus='alert(1)`,
]

// Todo payload contém `<`, `"` ou `'` — o escape transforma esses caracteres,
// então o payload VERBATIM no documento prova ausência de escape. (Checar só
// `onerror=` seria falso positivo: o texto escapado &lt;img onerror=...&gt; o
// contém e é inerte.)
function assertInert(html: string, payload: string) {
  expect(html, `payload chegou cru ao HTML: ${payload}`).not.toContain(payload)
}

describe('relatório de avaliação não executa dado do aluno (SEC-01)', () => {
  it('studentName com payload sai como texto literal', () => {
    for (const payload of PAYLOADS) {
      const html = buildAssessmentHtml({}, {}, payload)
      assertInert(html, payload)
    }
    // O conteúdo continua visível (escapado), não amputado:
    const html = buildAssessmentHtml({}, {}, '<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('observations com payload sai como texto literal', () => {
    for (const payload of PAYLOADS) {
      const html = buildAssessmentHtml({ observations: payload }, {}, 'Aluno')
      assertInert(html, payload)
    }
  })

  it('assessment_date com payload sai como texto literal', () => {
    for (const payload of PAYLOADS) {
      const html = buildAssessmentHtml({ assessment_date: payload }, {}, 'Aluno')
      assertInert(html, payload)
    }
  })

  it('classificações (IMC / gordura) com payload saem como texto literal', () => {
    for (const payload of PAYLOADS) {
      const html = buildAssessmentHtml(
        {},
        { bmiClassification: payload, bodyFatClassification: payload, bmi: 22, bodyComposition: { bodyFatPercentage: 15 } },
        'Aluno'
      )
      assertInert(html, payload)
    }
  })

  it('gender com payload nunca chega cru ao HTML (só entra em comparação)', () => {
    for (const payload of PAYLOADS) {
      const html = buildAssessmentHtml({ gender: payload }, {}, 'Aluno')
      assertInert(html, payload)
    }
  })

  it('nome legítimo com acento e apóstrofo continua legível', () => {
    const html = buildAssessmentHtml({}, {}, "José D'Ávila")
    expect(html).toContain('José D&#39;Ávila')
    expect(html).not.toContain('&amp;#39;') // não escapa duas vezes
  })
})
