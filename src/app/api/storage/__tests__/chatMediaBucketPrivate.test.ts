/**
 * Guard da auditoria 2026-08-13 (SEC-06): o bucket `chat-media` é PRIVADO
 * (migration 20260711220000_chat_media_bucket_private.sql) e a leitura passa
 * pelo proxy autorizado.
 *
 * O que quebrou: a rota `POST /api/storage/ensure-bucket` permitia que
 * QUALQUER usuário autenticado executasse `updateBucket('chat-media',
 * { public: true })` via service-role — desfazendo a migration e expondo a
 * mídia de TODAS as conversas. O fallback do signed-upload também recriava o
 * bucket como público quando ele não existisse.
 *
 * O que este guard trava (a CLASSE, não a instância):
 *  1. A rota ensure-bucket não pode voltar a existir.
 *  2. O client tipado não pode voltar a expor ensureBucket.
 *  3. NENHUMA rota de API pode chamar createBucket/updateBucket com
 *     `public: true` — varre todas, não só as duas do achado.
 *
 * Comentários são removidos antes do match (lição "guard acusando o próprio
 * comentário" do CLAUDE.md).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../../../..')
const API_DIR = path.join(ROOT, 'src/app/api')

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^\n]*/g, '$1')
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkRouteFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('chat-media permanece privado (SEC-06, auditoria 2026-08-13)', () => {
  it('a rota ensure-bucket não existe (removida de propósito — não recriar)', () => {
    const routeDir = path.join(API_DIR, 'storage/ensure-bucket')
    expect(
      fs.existsSync(routeDir),
      'ensure-bucket voltou a existir: essa rota deixava qualquer usuário logado tornar o bucket chat-media público via service-role. Não recrie; leia o cabeçalho deste teste.'
    ).toBe(false)
  })

  it('o client tipado não expõe ensureBucket', () => {
    const source = stripComments(
      fs.readFileSync(path.join(ROOT, 'src/lib/api/storage.ts'), 'utf8')
    )
    expect(source).not.toMatch(/ensureBucket|ensure-bucket/)
  })

  it('nenhuma rota de API cria ou atualiza bucket com public: true', () => {
    const offenders: string[] = []
    for (const file of walkRouteFiles(API_DIR)) {
      const source = stripComments(fs.readFileSync(file, 'utf8'))
      // Janela de 400 chars após a chamada: cobre o objeto de opções sem
      // casar um `public:` de outro trecho do arquivo.
      const calls = source.matchAll(/(?:createBucket|updateBucket)\s*\(/g)
      for (const call of calls) {
        const windowText = source.slice(call.index!, call.index! + 400)
        if (/public\s*:\s*true/.test(windowText)) offenders.push(path.relative(ROOT, file))
      }
    }
    expect(
      offenders,
      `Rota(s) definindo bucket como público: ${offenders.join(', ')}. O chat-media é privado por migration; public: true desfaz isso para todas as conversas.`
    ).toEqual([])
  })

  it('o fallback do signed-upload cria o bucket como privado', () => {
    const source = stripComments(
      fs.readFileSync(path.join(API_DIR, 'storage/signed-upload/route.ts'), 'utf8')
    )
    const call = source.match(/createBucket\s*\([\s\S]{0,400}/)
    expect(call, 'createBucket sumiu do signed-upload — se o fallback foi removido, atualize este guard').not.toBeNull()
    expect(call![0]).toMatch(/public\s*:\s*false/)
  })
})
