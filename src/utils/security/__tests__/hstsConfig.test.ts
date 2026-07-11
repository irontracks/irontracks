import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard (auditoria de middleware): o middleware NÃO cobre as rotas /auth/* (excluídas
 * do matcher), então o HSTS que era setado só ali deixava as páginas de auth — as mais
 * sensíveis a downgrade — sem Strict-Transport-Security. A trava agora é single-source
 * no vercel.json (source '/(.*)'), que cobre TODAS as rotas incluindo /auth/*. Manter
 * também no middleware emitiria header duplicado nas rotas casadas.
 */
describe('HSTS — single-source no vercel.json', () => {
  const vercel = readFileSync('vercel.json', 'utf8')
  const headers = readFileSync('src/utils/security/headers.ts', 'utf8')

  it('vercel.json define Strict-Transport-Security no bloco raiz /(.*) (cobre /auth/*)', () => {
    const cfg = JSON.parse(vercel) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }
    const root = cfg.headers.find((h) => h.source === '/(.*)')
    expect(root).toBeTruthy()
    const hsts = root!.headers.find((x) => x.key === 'Strict-Transport-Security')
    expect(hsts).toBeTruthy()
    expect(hsts!.value).toMatch(/max-age=\d+/)
    expect(hsts!.value).toMatch(/includeSubDomains/)
  })

  it('middleware NÃO seta HSTS (evita header duplicado nas rotas casadas)', () => {
    expect(headers).not.toMatch(/headers\.set\(\s*['"]Strict-Transport-Security/)
  })
})
