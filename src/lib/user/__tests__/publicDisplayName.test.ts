/**
 * Nome alheio na tela não pode ser um endereço de e-mail.
 *
 * Visto no aparelho em 13/08/2026: a lista de Conversas trazia
 * "byte-code.assistencia@hotmail.com" como título da linha. 9 dos 58 perfis
 * (16%) têm o e-mail salvo em `display_name`, e a tela exibia cru — o endereço
 * de gente real aparecendo na lista de contatos de terceiros.
 *
 * Correção de EXIBIÇÃO, não de dado: o handle identifica para quem conhece a
 * pessoa, sem publicar onde escrever para ela. O `display_name` no banco fica
 * como está, porque o dono da conta ainda pode querer editá-lo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicDisplayName } from '../publicDisplayName'

describe('publicDisplayName', () => {
  it('e-mail vira handle — o domínio não vai para a tela', () => {
    expect(publicDisplayName('byte-code.assistencia@hotmail.com')).toBe('byte-code.assistencia')
    expect(publicDisplayName('eli_filho@hotmail.com')).toBe('eli_filho')
  })

  it('nome de gente passa intacto', () => {
    expect(publicDisplayName('DJ MK Brasil')).toBe('DJ MK Brasil')
    expect(publicDisplayName('jorge oshima')).toBe('jorge oshima')
  })

  it('handle de rede social não é e-mail — preserva', () => {
    expect(publicDisplayName('@fulano')).toBe('@fulano')
  })

  it('vazio cai no fallback, sem inventar', () => {
    expect(publicDisplayName(null)).toBe('Usuário')
    expect(publicDisplayName('   ')).toBe('Usuário')
    expect(publicDisplayName('@dominio.com')).toBe('@dominio.com')
  })
})

describe('fiação — a lista de Conversas usa o leitor', () => {
  const src = readFileSync(join('src', 'components', 'ChatListScreen.tsx'), 'utf8')
  const codigo = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('nenhum display_name vai cru para o título da linha', () => {
    expect(codigo).not.toMatch(/>\{u\.display_name\}</)
  })

  it('o título passa por publicDisplayName', () => {
    const titulos = codigo.match(/<h4[^>]*>\{[^}]*\}<\/h4>/g) ?? []
    expect(titulos.length).toBeGreaterThan(0)
    for (const t of titulos) expect(t).toContain('publicDisplayName(')
  })
})
