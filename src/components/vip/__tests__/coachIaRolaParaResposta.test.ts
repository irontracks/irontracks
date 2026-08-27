import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/components/VipHub.tsx'), 'utf8')

/**
 * O Coach IA não rolava para a resposta.
 *
 * O card tem altura FIXA de 600px e o texto chega por SSE, token a token,
 * ABAIXO do viewport: o usuário perguntava e olhava para uma tela parada. O
 * produto funcionava e PARECIA travado — a pior combinação, porque ele desiste
 * antes de descobrir que a resposta existe.
 *
 * O `chatRef` já estava declarado, mas preso ao contêiner EXTERNO
 * (`h-[600px] overflow-hidden`, que por definição não rola) e nunca era lido.
 */
describe('Coach IA: a resposta chega à vista', () => {
  it('o ref está no elemento que ROLA, não no contêiner de altura fixa', () => {
    const externo = src.slice(src.indexOf('h-[600px]') - 220, src.indexOf('h-[600px]'))
    expect(
      externo,
      'o contêiner externo tem overflow-hidden: um ref nele não serve para rolar nada',
    ).not.toMatch(/ref=\{chatRef\}/)

    const rolavel = src.slice(src.indexOf('flex-1 overflow-y-auto') - 120, src.indexOf('flex-1 overflow-y-auto'))
    expect(rolavel, 'a área de mensagens precisa do ref').toMatch(/ref=\{chatRef\}/)
  })

  it('rola quando a conversa cresce', () => {
    const efeito = src.slice(src.indexOf('useEffect(() => {\n    const el = chatRef.current'))
    expect(efeito.slice(0, 400), 'sem dependência em `messages` o efeito não acompanha o streaming')
      .toMatch(/\}, \[messages\]\)/)
    expect(efeito.slice(0, 400), 'precisa levar o scroll ao fim').toMatch(/scrollTop = el\.scrollHeight/)
  })

  it('NÃO sequestra a leitura de quem rolou para cima', () => {
    const efeito = src.slice(src.indexOf('const el = chatRef.current'), src.indexOf('}, [messages])'))
    expect(
      efeito,
      'sem a guarda de proximidade, cada token arrasta de volta quem está lendo ' +
      'uma resposta anterior — rolar sempre é tão ruim quanto não rolar nunca',
    ).toMatch(/scrollHeight - el\.scrollTop - el\.clientHeight/)
  })
})
