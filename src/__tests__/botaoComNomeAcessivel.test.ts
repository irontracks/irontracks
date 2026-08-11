/**
 * Guard: botão só de ícone precisa de nome acessível.
 *
 * Quem usa VoiceOver ouve "botão" e mais nada — o ícone não fala. Foram 26
 * casos no app em 11/08/2026, quase todos fechar/voltar de modal: o usuário
 * cego encontrava a saída por tentativa e erro.
 *
 * `title` NÃO resolve. Em botão sem texto, o VoiceOver do iOS não o anuncia de
 * forma confiável — e este repo tinha exatamente esse caso no header das
 * Avaliações, com `title="Fechar"` e nenhum `aria-label` (e o title ainda
 * mentia: a ação era voltar).
 *
 * ## O detector errou duas vezes antes de acertar, e vale saber por quê
 * 1ª versão acusou botões cujo texto vinha de expressão condicional
 * (`{saved ? <>…Salvo</> : 'Salvar'}`) — a regex apagava a expressão inteira
 * junto com o ícone. Corrigido lendo as strings literais de dentro dela.
 * 2ª versão acusou wrappers genéricos (`<button>{children}</button>`,
 * `{action.label}`), onde o nome chega por prop e um `aria-label` fixo seria
 * ERRADO. Corrigido tratando `{ident}` puro como conteúdo dinâmico.
 *
 * Guard que grita no lugar errado é afrouxado na primeira semana — por isso as
 * duas correções vieram antes de qualquer `aria-label` ser escrito no app.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const BOTAO = /<button\b([^>]*)>([\s\S]*?)<\/button>/g
/** `{children}`, `{label}`, `{action.label}` — o nome vem de fora. */
const CONTEUDO_DINAMICO = /^\{\s*[A-Za-z_$][\w$]*(\.[\w$]+)*\s*\}$/

/** Tem texto visível? Considera literais dentro de expressões condicionais. */
function temTextoVisivel(inner: string): boolean {
  const semComentario = inner.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim()
  if (CONTEUDO_DINAMICO.test(semComentario)) return true

  const literais = [...semComentario.matchAll(/'([^'\\]{2,})'|"([^"\\]{2,})"/g)]
  const temLiteralDeTexto = literais.some((m) => {
    const s = m[1] ?? m[2] ?? ''
    // descarta o que é claramente classe/atributo css
    return /[A-Za-zÀ-ÿ]/.test(s) && !/^[a-z-]+$/.test(s)
  })
  if (temLiteralDeTexto) return true

  const semTags = semComentario.replace(/<[^>]*>/g, '').replace(/\{[^{}]*\}/g, '')
  return /[A-Za-zÀ-ÿ]{2,}/.test(semTags)
}

const arquivos = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  .map((f) => f.split('\\').join('/'))

describe('nome acessível em botão só de ícone', () => {
  it('o guard tem alvos — varredura vazia não protege nada', () => {
    expect(arquivos.length).toBeGreaterThan(50)
  })

  it('nenhum botão só de ícone fica sem aria-label', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!src.includes('<button')) continue
      for (const m of src.matchAll(BOTAO)) {
        const [, attrs, inner] = m
        if (attrs.includes('aria-label') || attrs.includes('aria-labelledby')) continue
        if (temTextoVisivel(inner)) continue
        const linha = src.slice(0, m.index).split('\n').length
        infratores.push(`${rel}:${linha}`)
      }
    }
    expect(
      infratores,
      'Botão sem texto precisa de aria-label — quem usa leitor de tela só ouve ' +
        '"botão". `title` não substitui: não é anunciado de forma confiável em ' +
        'botão sem texto no VoiceOver do iOS.',
    ).toEqual([])
  })
})
