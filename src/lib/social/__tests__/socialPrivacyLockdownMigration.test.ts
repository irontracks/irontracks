import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression guard da migration social_follows_and_stories_privacy_lockdown (2026-07-11),
 * que fechou 2 CRÍTICOS de privacidade confirmados por SQL na auditoria social/feed:
 *   #1 — social_follows: INSERT passa a exigir status='pending' (bloqueia self-accept
 *        de follow em conta privada). anon perde escrita na tabela.
 *   #2 — bucket social-stories: policies owner-scoped (só o dono lê/escreve os bytes;
 *        seguidores continuam vendo pela rota /media com signed URL de service-role).
 * Trava as invariantes em SQL versionado no repo.
 */
describe('migration social_follows_and_stories_privacy_lockdown', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('social_follows_and_stories_privacy_lockdown'))

  it('existe no repo', () => {
    expect(file).toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('#1: INSERT de social_follows exige status=pending (bloqueia self-accept)', () => {
    expect(sql).toMatch(/create policy\s+social_follows_insert_own[\s\S]*for insert/i)
    expect(sql).toMatch(/with check\s*\(\s*follower_id\s*=\s*\(\s*select auth\.uid\(\)\s*\)\s*and\s*status\s*=\s*'pending'\s*\)/i)
  })

  it('#1: revoga escrita de anon em social_follows', () => {
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete[\s\S]*on public\.social_follows\s+from anon/i)
  })

  it('#2: dropa as 3 policies antigas abertas do bucket social-stories', () => {
    expect(sql).toMatch(/drop policy if exists "Stories Select" on storage\.objects/i)
    expect(sql).toMatch(/drop policy if exists "Stories Insert" on storage\.objects/i)
    expect(sql).toMatch(/drop policy if exists "Stories Update" on storage\.objects/i)
  })

  it('#2: cria policies owner-scoped (foldername[1] = auth.uid) para select/insert/update', () => {
    for (const cmd of ['select', 'insert', 'update']) {
      expect(sql).toMatch(new RegExp(`create policy "social_stories_owner_${cmd}" on storage\\.objects`, 'i'))
    }
    // amarra ao dono via a primeira pasta do path = uid
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*\(\s*select auth\.uid\(\)\s*\)::text/i)
    // não deixa nenhuma policy nova só com bucket_id (aberta)
    expect(sql).not.toMatch(/for select to authenticated\s+using \(bucket_id = 'social-stories'\)\s*;/i)
  })
})
