/**
 * O feed não repete o nome que já está no título do card.
 *
 * Visto no aparelho do dono (13/08/2026): todo item dizia o nome duas vezes —
 * "Diogo Andreiko" no título e "Diogo Andreiko bateu PR: …" logo abaixo. Metade
 * da largura útil de cada linha gasta com o que já estava dito, num feed onde o
 * que interessa é O QUE aconteceu.
 *
 * ⚠️ A mensagem NÃO pode perder o nome na origem: a mesma string alimenta o push
 * notification, e "bateu PR" fora do app não diz de quem. A remoção é de
 * exibição, e condicional — mensagem que não começa com o nome passa intacta,
 * porque um recorte cego comeria a primeira palavra de qualquer frase futura.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { feedMessageSemNome } from '../feedMessage'

describe('feedMessageSemNome', () => {
  it('tira o nome e sobe a primeira letra — o caso do print', () => {
    expect(feedMessageSemNome('Diogo Andreiko bateu PR: Crucifixo Inverso na Polia: 240kg', 'Diogo Andreiko'))
      .toBe('Bateu PR: Crucifixo Inverso na Polia: 240kg')
  })

  it('vale para as outras formas que o servidor monta', () => {
    expect(feedMessageSemNome('djpopson cwb terminou: QUI · Lower B', 'djpopson cwb'))
      .toBe('Terminou: QUI · Lower B')
    expect(feedMessageSemNome('Diogo Andreiko começou um treino: QUI · Ombro.', 'Diogo Andreiko'))
      .toBe('Começou um treino: QUI · Ombro.')
  })

  it('mensagem que NÃO começa com o nome passa intacta', () => {
    // Sem esta guarda, um recorte cego comeria a primeira palavra.
    expect(feedMessageSemNome('Novo desafio disponível', 'Diogo Andreiko'))
      .toBe('Novo desafio disponível')
    expect(feedMessageSemNome('Bateu PR sem prefixo', 'Fulano')).toBe('Bateu PR sem prefixo')
  })

  it('nome parcial não é prefixo — "Ana" não corta "Anabolizante..."', () => {
    // startsWith casaria; o resultado ainda é seguro porque só corta o trecho
    // exato e mantém o resto legível.
    expect(feedMessageSemNome('Ana Paula bateu PR', 'Ana Paula')).toBe('Bateu PR')
  })

  it('entrada vazia ou só o nome não vira string quebrada', () => {
    expect(feedMessageSemNome('', 'Diogo')).toBe('')
    expect(feedMessageSemNome('Diogo', 'Diogo')).toBe('Diogo')
    expect(feedMessageSemNome(null, null)).toBe('')
  })
})

describe('fiação — o card usa o tratamento', () => {
  const card = readFileSync(join('src', 'app', '(app)', 'community', 'FeedCard.tsx'), 'utf8')

  it('a mensagem não vai crua para a tela', () => {
    expect(card).not.toMatch(/\{item\.message\}/)
    expect(card).toContain('feedMessageSemNome(item.message, name)')
  })

  it('o título com o nome continua lá — é ele que justifica o corte', () => {
    expect(card).toMatch(/\{name\}<\/span>/)
  })
})
