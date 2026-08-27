import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A raiz do login era `h-screen overflow-hidden`. Num iPhone SE o hero de 192px
 * mais o formulário não cabem — e sem rolagem o botão CADASTRAR fica FORA da
 * tela e inalcançável. Não é cadastro difícil: é cadastro impossível.
 *
 * O `overflow-hidden` existe para conter o glow ambiente e as partículas. Quem
 * precisa contê-los é o wrapper decorativo, que já é `absolute inset-0` — não a
 * raiz, que carrega o formulário inteiro.
 */
describe('tela de login em aparelho pequeno', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/LoginScreen.tsx'), 'utf8')
  const raiz = src.slice(src.indexOf('className="relative flex flex-col'), src.indexOf('Subtle ambient glow'))

  it('a raiz não fixa a altura da janela', () => {
    expect(raiz, 'com altura fixa, o que não couber fica inalcançável').not.toMatch(/\bh-screen\b/)
  })

  it('a raiz rola quando o conteúdo não cabe', () => {
    expect(raiz, 'sem rolagem o botão de cadastrar fica fora da tela no iPhone SE').toMatch(/overflow-y-auto/)
  })

  it('o glow decorativo é quem contém o transbordo', () => {
    const glow = src.slice(src.indexOf('Subtle ambient glow'), src.indexOf('Floating gold particles'))
    expect(glow, 'sem isto o brilho de 600px cria barra de rolagem horizontal').toMatch(/overflow-hidden/)
  })
})
