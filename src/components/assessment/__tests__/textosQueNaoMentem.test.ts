import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Quatro rótulos da aba Avaliações que prometiam o que a tela não faz. Nenhum
 * quebra função — todos quebram a CONFIANÇA, que custa mais caro: o usuário
 * para de acreditar no que lê e passa a testar o app por tentativa.
 */
describe('avaliações: o rótulo diz o que a tela faz', () => {
  it('o contador do botão conta as poses que ele promete', () => {
    const modal = semComentarios(ler('src/components/body-photo/BodyPhotoCaptureModal.tsx'))
    const cta = modal.slice(modal.indexOf('Analisar {'), modal.indexOf('Analisar {') + 120)
    expect(
      cta,
      '`capturedCount` conta as SEIS poses (relaxadas + contraídas) e o rótulo diz "/3": ' +
      'com tudo preenchido, o botão exibia "(6/3)"',
    ).not.toMatch(/capturedCount/)
    expect(cta, 'o "/3" são as relaxadas').toMatch(/relaxedCount/)
  })

  it('o card de exame falhado descreve o clique que ele tem', () => {
    const card = semComentarios(ler('src/components/lab-exams/LabExamCard.tsx'))
    expect(
      card,
      'o clique é `onView` e o botão fica disabled sem conteúdo: mandar "apagar" ' +
      'era falso nos dois casos',
    ).not.toMatch(/toque para apagar/)
    const bloco = card.slice(card.indexOf('isFailed ?'), card.indexOf('isFailed ?') + 400)
    expect(bloco, 'o texto precisa ramificar por conteúdo').toMatch(/temConteudo \?/)
  })

  it('o formulário se anuncia como EDIÇÃO quando está editando', () => {
    const form = semComentarios(ler('src/components/assessment/AssessmentForm.tsx'))
    const h1 = form.slice(form.indexOf('<h1'), form.indexOf('</h1>'))
    expect(
      h1,
      'o modal do histórico já diz "Editar Avaliação" 40px acima — o h1 dizia "Nova"',
    ).toMatch(/initialData \?/)
  })

  it('"Ver Histórico" não aparece onde não há histórico', () => {
    const header = semComentarios(ler('src/components/assessment/AssessmentHeader.tsx'))
    expect(header, 'a prop precisa ser opcional, como os outros três atalhos').toMatch(/onShowHistory\?:/)
    expect(header, 'sem a prop, o botão não deve existir').toMatch(/\{onShowHistory \?/)

    const tela = semComentarios(ler('src/components/assessment/AssessmentHistory.tsx'))
    expect(
      tela,
      'passar `() => {}` devolve um botão morto na única tela sem histórico para ver',
    ).not.toMatch(/onShowHistory=\{\(\) => \{\}\}/)
  })
})
