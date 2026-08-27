import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const agenda = semComentarios(ler('src/app/(app)/dashboard/schedule/ScheduleClient.tsx'))
const menu = semComentarios(ler('src/components/HeaderActionsMenu.tsx'))

describe('Agenda: o que falha, aparece', () => {
  /**
   * O painel de erro vive na PÁGINA e os modais são `z-50`/`z-[60]`: uma falha
   * ao salvar era renderizada ATRÁS do modal que a causou. O usuário tocava em
   * Salvar, nada acontecia, e o motivo estava escondido no fundo.
   */
  it('o erro aparece DENTRO do modal, não atrás dele', () => {
    const modal = agenda.slice(agenda.indexOf('fixed inset-0 z-50'))
    expect(
      modal.slice(0, 1500),
      'sem uma cópia do erro dentro do modal, a falha fica invisível para quem acabou de salvar',
    ).toMatch(/\{error &&/)
    const pagina = agenda.slice(0, agenda.indexOf('fixed inset-0 z-50'))
    expect(
      pagina,
      'o painel da página precisa calar com o modal aberto — senão a mesma mensagem sai duas vezes',
    ).toMatch(/error && !isModalOpen/)
  })

  /**
   * Era `selectedDate || trimmedDate`: recarregava o dia que está na TELA, não
   * o dia do agendamento. Quem via o 27 e agendava para o 30 salvava, a lista
   * do 27 recarregava, nada aparecia — e concluía que não tinha salvado.
   */
  it('depois de salvar, a tela vai para a data do AGENDAMENTO', () => {
    const bloco = agenda.slice(agenda.indexOf('const targetDate'), agenda.indexOf('const targetDate') + 320)
    expect(bloco, 'a data do agendamento tem precedência sobre a que está na tela')
      .toMatch(/trimmedDate \|\| selectedDate/)
    expect(bloco, 'se a data mudou, a tela precisa acompanhar').toMatch(/setSelectedDate\(targetDate\)/)
  })
})

describe('menu do avatar: cancelar VIP usa o diálogo do app', () => {
  it('nenhum window.confirm/alert no fluxo de cancelamento', () => {
    expect(
      menu,
      'o diálogo nativo sai sem identidade visual, sem o vermelho de destrutivo ' +
      'e sem safe-area no iPhone',
    ).not.toMatch(/window\.(confirm|alert)\(/)
  })

  it('a confirmação se declara destrutiva', () => {
    const bloco = menu.slice(menu.indexOf('const cancelVip'), menu.indexOf('const cancelVip') + 900)
    expect(bloco, 'cancelar assinatura é destrutivo').toMatch(/destructive:\s*true/)
    expect(bloco, 'cancelar precisa ser o confirmText').toMatch(/confirmText:\s*'Cancelar assinatura'/)
  })
})
