import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('menu do avatar: o véu não é um controle', () => {
  const menu = semComentarios(ler('src/components/HeaderActionsMenu.tsx'))

  /**
   * O backdrop era um `<button>` de tela inteira com `aria-label="Fechar menu"`:
   * entrava na ordem de foco e era anunciado "Fechar menu, botão" — um alvo
   * gigante prometendo uma ação que o próprio menu já oferece.
   *
   * O repo já tinha resolvido isso no PR #779, com o helper `backdropProps`
   * (role presentation, tabIndex -1 e o guard de `e.target === e.currentTarget`).
   * Este ponto tinha escapado da varredura.
   */
  it('usa o helper do repo em vez de um <button> de tela inteira', () => {
    expect(menu, 'o helper existe desde o #779 — não reimplemente o véu').toMatch(/backdropProps\(/)
    const trecho = menu.slice(menu.indexOf('zIndex: 9998') - 400, menu.indexOf('zIndex: 9998'))
    expect(trecho, 'o véu não pode ser <button>: não é controle').not.toMatch(/<button/)
  })
})

describe('conversas: um fato, uma vez', () => {
  const lista = semComentarios(ler('src/components/ChatListScreen.tsx'))
  const secao = lista.slice(lista.indexOf('onlineUsers.map('), lista.indexOf('onlineUsers.map(') + 2000)

  /**
   * A seção já se anuncia "● Online — N" no cabeçalho, com fundo verde. Cada
   * linha ainda trazia ponto verde no avatar E "Online agora" em texto verde: o
   * mesmo fato cinco vezes no mesmo bloco, ocupando os 68px onde caberia a
   * prévia da conversa.
   */
  it('a linha não repete o que o cabeçalho da seção já diz', () => {
    expect(
      secao,
      '"Online agora" em cada linha repete a frase do cabeçalho — DESIGN_HIERARCHY: um fato aparece uma vez',
    ).not.toMatch(/>Online agora</)
  })

  it('o PONTO de presença fica — é o sinal que sobrevive à rolagem', () => {
    expect(
      secao,
      'sem o ponto no avatar, quem rola até o cabeçalho sair da tela perde a informação',
    ).toMatch(/bg-green-500/)
  })
})
