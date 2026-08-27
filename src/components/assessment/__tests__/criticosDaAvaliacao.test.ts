import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Quatro críticos da aba Avaliações — auditoria de design, 26/08/2026. */
describe('avaliação física: os quatro críticos', () => {
  it('o nome do aluno não é literal — ele vai para o PDF', () => {
    const pagina = semComentarios(ler('src/app/assessments/new/[studentId]/page.tsx'))
    expect(
      pagina,
      "`const studentName = 'Aluno'` era a ÚNICA fonte de nome do formulário, e chegava " +
      'ao PDF e ao JSON exportados: o profissional recebia um laudo de "Aluno".',
    ).not.toMatch(/studentName\s*=\s*['"]Aluno['"]/)
    expect(pagina, 'o nome precisa vir do perfil').toMatch(/display_name/)
  })

  it('o passo de fotos não tem navegação própria nem trava a saída', () => {
    const passo = semComentarios(ler('src/components/assessment/PhotoUploadStep.tsx'))
    expect(
      passo,
      'o passo se declara OPCIONAL duas vezes na tela — não pode bloquear o "Próximo"',
    ).not.toMatch(/isComplete/)
    expect(
      passo,
      'a navegação é do AssessmentForm; este era o único passo que renderizava a sua, ' +
      'empilhando dois rodapés na mesma tela',
    ).not.toMatch(/>\s*Próximo\s*</)
  })

  it('a variação usa a MESMA fonte da lista, e o zero não vira alarme', () => {
    const cards = semComentarios(ler('src/components/assessment/AssessmentSummaryCards.tsx'))
    expect(
      cards,
      '`getProgress` devolve {change: 0} no empate e o isPositive binário lia isso como ' +
      'negativo: peso idêntico pintava "0.0 kg" de VERMELHO com seta para baixo',
    ).not.toMatch(/getProgress/)
    expect(cards, 'computeDelta é a fonte que a lista já usa').toMatch(/computeDelta\(/)
    expect(
      cards,
      'a direção precisa ser explícita por métrica: ganhar peso não é bom nem ruim ' +
      'sem saber o objetivo, e `BetterDirection` admite null',
    ).toMatch(/BetterDirection/)
  })

  it('a tela de conferência mostra a data da AVALIAÇÃO', () => {
    const preview = semComentarios(ler('src/components/assessment/ResultsPreview.tsx'))
    const bloco = preview.slice(preview.indexOf('>Data<'), preview.indexOf('>Data<') + 400)
    expect(
      bloco,
      'a tela existe para conferir antes de salvar, e mostrava o relógio em vez do ' +
      'campo — que é editável no primeiro passo',
    ).not.toMatch(/formatDate\(new Date\(\)\)/)
    expect(preview, 'a data vem de assessment_date').toMatch(/assessment_date/)
  })
})
