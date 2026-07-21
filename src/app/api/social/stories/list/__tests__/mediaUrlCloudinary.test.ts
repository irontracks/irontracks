import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (reportado pelo dono, com print): TODOS os stories abriam pretos, com ícone de
 * imagem quebrada. Causa: a rota list tratava CADA media_path como caminho do bucket
 * `social-stories` e chamava createSignedUrls — mas os stories são salvos com URL ABSOLUTA
 * do Cloudinary. Assinar uma URL absoluta como se fosse objeto do bucket gera uma URL Supabase
 * falsa (.../object/sign/social-stories/https://res.cloudinary.com/...) que dá 400.
 * Confirmado no banco: 3/3 stories ativos usavam URL Cloudinary.
 *
 * Fix: URL absoluta (http/https) vai DIRETO como mediaUrl (CDN público); só caminho de bucket
 * é assinado. A rota de fallback media/ já tratava https:// — a list é que faltava.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const src = stripComments(readFileSync('src/app/api/social/stories/list/route.ts', 'utf8'))

describe('stories/list — media_path Cloudinary não é assinado', () => {
  it('detecta URL absoluta (http/https)', () => {
    expect(src).toMatch(/isAbsoluteUrl/)
    expect(src).toMatch(/\^https\?:/)
  })

  it('URL absoluta é EXCLUÍDA da lista que vai pra createSignedUrls', () => {
    // mediaPaths (o que é assinado) filtra fora as URLs absolutas.
    expect(src).toMatch(/mediaPaths\s*=\s*stories[\s\S]*?!isAbsoluteUrl/)
  })

  it('URL absoluta vira mediaUrl DIRETO (sem passar pela assinatura)', () => {
    expect(src).toMatch(/isAbsoluteUrl\(s\.media_path\)\s*\?\s*s\.media_path/)
  })

  it('caminho de bucket continua usando a URL assinada', () => {
    expect(src).toMatch(/signedUrlByPath\.get\(s\.media_path\)/)
  })
})
