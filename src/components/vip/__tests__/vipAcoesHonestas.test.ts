import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('VIP: a ação faz o que o rótulo promete', () => {
  const hub = semComentarios(ler('src/components/VipHub.tsx'))

  /**
   * `bumpChatUsage` atualizava `vipStatus.usage.chat_daily`, mas o chip da tela
   * lê `credits`, do `useVipCredits` — duas fontes, e o bump mexia justamente
   * na que não é exibida. Com `staleTime: 30s`, o contador ficava parado
   * enquanto o crédito era consumido. O `refresh` já existia no hook e ninguém
   * o pegava.
   */
  it('gastar crédito atualiza o contador que está na tela', () => {
    expect(hub, 'o hook expõe `refresh` — sem pegá-lo, o chip nunca se move').toMatch(/refresh:\s*refreshCredits/)
    const bump = hub.slice(hub.indexOf('const bumpChatUsage'), hub.indexOf('const bumpChatUsage') + 260)
    expect(bump, 'o bump precisa atualizar a fonte que o chip lê').toMatch(/refreshCredits\(\)/)
  })

  /**
   * Não existe rota que apague a thread: `api/vip/chat/` tem GET e POST, e o
   * efeito do histórico recarrega tudo na próxima montagem. O botão dizia
   * "Limpar conversa" e a conversa voltava sozinha.
   */
  it('"limpar" pergunta e não promete apagar o que não apaga', () => {
    const bloco = hub.slice(hub.indexOf('Limpar a tela do chat') - 1200, hub.indexOf('Limpar a tela do chat'))
    expect(bloco, 'ação destrutiva aos olhos do usuário, sem confirmação').toMatch(/await confirm\(/)
    expect(
      bloco,
      'o texto precisa dizer que o histórico salvo NÃO é apagado — senão a ' +
      'promessa continua falsa, só que com um diálogo pelo meio',
    ).toMatch(/histórico salvo não é apagado/)
  })

  /**
   * Verde é a cor de SUCESSO no app. Fixo, ele afirmava que a energia estava
   * boa mesmo em 1.2 de 5.
   */
  it('a cor da Energia acompanha o valor', () => {
    const card = semComentarios(ler('src/components/vip/VipWeeklySummaryCard.tsx'))
    const bloco = card.slice(card.indexOf('checkins?.energy != null'), card.indexOf('checkins?.energy != null') + 700)
    // ⚠️ Assertar a PRESENÇA de `energiaBoa` no bloco não basta: com o ícone
    // fixo e só o rótulo condicional, o bloco ainda contém a palavra e o caso
    // passa verde. Medido por mutação. Mire na AUSÊNCIA do verde incondicional.
    const verdesFixos = [...bloco.matchAll(/className="[^"]*text-green-[^"]*"/g)].map((m) => m[0])
    expect(
      verdesFixos,
      'verde fixo afirma que a energia está boa mesmo em 1.2 de 5 — a cor precisa ' +
      'ser condicional em TODOS os elementos do bloco, não só no rótulo',
    ).toEqual([])
    expect(bloco, 'a cor precisa depender do valor').toMatch(/energiaBoa/)
    expect(card, 'o corte sai da escala que a própria API entrega').toMatch(/energiaBoa\s*=.*energyScale\s*\/\s*2/)
  })
})
