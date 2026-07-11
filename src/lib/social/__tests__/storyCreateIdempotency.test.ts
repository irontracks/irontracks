import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard da idempotência do story create (auditoria offline). Um timeout no fetch de
 * publicação após o commit + re-tap gerava story duplicado. Fix em 3 partes:
 *  - migration: client_id + índice único parcial (author_id, client_id);
 *  - rota: passa client_id no insert e trata 23505 devolvendo a linha existente;
 *  - compositor: reusa o mesmo clientId no retry (ref resetada no sucesso).
 */
describe('migration social_stories_client_id_idempotency', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('social_stories_client_id_idempotency'))

  it('existe e cria a coluna + índice único parcial', () => {
    expect(file).toBeTruthy()
    const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''
    expect(sql).toMatch(/add column if not exists client_id text/i)
    expect(sql).toMatch(/create unique index[\s\S]*social_stories\s*\(author_id,\s*client_id\)\s*where client_id is not null/i)
  })
})

describe('rota stories/create — idempotência', () => {
  const src = readFileSync('src/app/api/social/stories/create/route.ts', 'utf8')

  it('inclui client_id no insert', () => {
    expect(src).toMatch(/client_id:\s*clientId/)
  })

  it('trata 23505 devolvendo a linha existente (idempotent)', () => {
    expect(src).toMatch(/code\s*===\s*'23505'/)
    expect(src).toMatch(/idempotent:\s*true/)
  })
})

describe('compositor — clientId reusado no retry', () => {
  const src = readFileSync('src/components/stories/useStoryComposer.ts', 'utf8')

  it('só gera o clientId se ainda não existe (reusa no re-tap) e envia no body', () => {
    expect(src).toMatch(/if\s*\(\s*!publishClientIdRef\.current\s*\)/)
    expect(src).toMatch(/clientId:\s*publishClientIdRef\.current/)
  })

  it('reseta a ref no sucesso', () => {
    expect(src).toMatch(/publishClientIdRef\.current\s*=\s*null/)
  })
})
