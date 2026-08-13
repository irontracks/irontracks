/**
 * Lista de Conversas — a segunda linha carrega FATO, não instrução.
 *
 * Antes, cada contato trazia "Toque para conversar" na segunda linha. Numa
 * lista de 20 contatos são 20 repetições idênticas: zero informação, ocupando
 * exatamente o lugar onde numa lista de conversas vive a prévia da mensagem.
 * E a affordance que a frase prometia já estava no avatar, na linha inteira
 * clicável e no ícone à direita.
 *
 * O ícone, aliás, era `opacity-0 group-hover:opacity-100` — no celular não
 * existe hover, então ele NUNCA aparecia. Era decoração invisível no único
 * lugar onde o app roda de verdade.
 *
 * A frase de presença é montada inteira e não por concatenação: `formatLastSeen`
 * devolve "Nunca" e "Agora", e "Visto há Nunca" não é português.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join('src', 'components', 'ChatListScreen.tsx'), 'utf8')
/** Só o executável: o guard não pode se satisfazer com o comentário que o explica. */
const codigo = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

describe('Conversas — segunda linha informa, não instrui', () => {
  it('nenhuma linha repete a mesma frase para todo contato', () => {
    expect(codigo).not.toContain('Toque para conversar')
  })

  it('a presença é uma frase inteira, sem prefixo colado', () => {
    // "Visto há {formatLastSeen(...)}" produziria "Visto há Nunca".
    expect(codigo).not.toMatch(/Visto há \{/)
    expect(codigo).toMatch(/presencaLabel\(/)
  })

  it('a affordance não depende de hover — no celular ele não existe', () => {
    expect(codigo).not.toMatch(/opacity-0\s+group-hover:opacity/)
  })
})
