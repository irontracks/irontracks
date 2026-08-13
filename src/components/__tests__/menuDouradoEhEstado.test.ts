/**
 * No menu do avatar, o dourado significa UMA coisa: há algo vivo aqui agora.
 *
 * Estado em 12/08/2026 (print do dono): cinco itens dourados, por três motivos
 * diferentes e visualmente idênticos —
 *
 *   categoria  → Área do professor, Painel de Controle, Agenda, Cobranças (fixo)
 *   estado     → Notificações, Conversas (só com não lido)
 *   convite    → Ver tour (fixo)
 *
 * O item com informação PERECÍVEL ("você tem mensagem nova") tinha exatamente o
 * mesmo peso visual de "Ver tour", que não muda nunca e é o menos relevante para
 * quem usa o app há meses. Quando um sinal significa três coisas, não significa
 * nenhuma — e é o sinal perecível que morre, porque é o único que precisava ser
 * notado.
 *
 * Pertencimento a "área de coach" continua comunicado pelo AGRUPAMENTO: os
 * divisores já separam o bloco e fazem o trabalho sem gastar o pigmento da ação
 * primária. O app já tem a regra escrita — dourado = você decide.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join('src', 'components', 'HeaderActionsMenu.tsx'), 'utf8')

/** Cada `<MenuItem ...>` do arquivo, com a tag inteira. */
const itens = (): { label: string; tag: string }[] => {
  const out: { label: string; tag: string }[] = []
  for (const m of src.matchAll(/<MenuItem\b/g)) {
    let i = (m.index ?? 0) + m[0].length
    let prof = 0
    while (i < src.length) {
      const c = src[i]
      if (c === '{' || c === '(' || c === '[') prof++
      else if (c === '}' || c === ')' || c === ']') prof--
      else if (c === '>' && prof <= 0) break
      i++
    }
    const tag = src.slice(m.index ?? 0, i)
    const lab = /label="([^"]+)"/.exec(tag)
    if (lab) out.push({ label: lab[1], tag })
  }
  return out
}

describe('menu do avatar — dourado é estado, não categoria', () => {
  it('nenhum item nasce dourado: o gold é sempre condicionado a algo vivo', () => {
    const fixos = itens()
      .filter(({ tag }) => /(^|\s)gold(\s|\n|\/)/.test(tag) && !/gold=\{/.test(tag))
      .map(({ label }) => label)
    expect(
      fixos,
      'dourado fixo marca categoria, e categoria já é dita pelo agrupamento. ' +
        'Se o item precisa de destaque permanente, o problema é a ORDEM dele no ' +
        'menu, não a cor.',
    ).toEqual([])
  })

  it('os dois itens de estado seguem acendendo quando há não lido', () => {
    const porLabel = Object.fromEntries(itens().map((i) => [i.label, i.tag]))
    expect(porLabel['Notificações']).toMatch(/gold=\{!!hasUnreadNotification\}/)
    expect(porLabel['Conversas']).toMatch(/gold=\{!!hasUnreadChat\}/)
  })

  it('o parser pega a tag inteira, mesmo com handler inline', () => {
    // `<MenuItem([^>]*)>` pararia no `>` do `=>` e leria metade da tag.
    const comHandler = itens().filter(({ tag }) => tag.includes('=>'))
    expect(comHandler.length).toBeGreaterThan(5)
    expect(comHandler.every(({ tag }) => tag.includes('label='))).toBe(true)
  })
})
