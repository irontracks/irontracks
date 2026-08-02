import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: o GET /api/gps/cardio/[id] (usado pra gerar o Story de uma corrida
 * antiga) NÃO pode vazar a rota de outro usuário. Precisa exigir auth (requireUser)
 * e filtrar por user_id do dono. Trava esses invariantes.
 */
const src = readFileSync(
  join(process.cwd(), 'src/app/api/gps/cardio/[id]/route.ts'),
  'utf8',
)

describe('GET /api/gps/cardio/[id] — segurança', () => {
  it('existe um handler GET', () => {
    expect(src).toMatch(/export\s+async\s+function\s+GET/)
  })

  it('exige usuário autenticado (requireUser)', () => {
    // pega o corpo do GET e confirma o requireUser dentro dele
    const start = src.indexOf('export async function GET')
    const rest = src.slice(start)
    const end = rest.indexOf('export async function PATCH')
    const body = end > -1 ? rest.slice(0, end) : rest
    expect(body).toContain('requireUser()')
  })

  it('filtra pela rota do DONO (user_id = auth.user.id)', () => {
    const start = src.indexOf('export async function GET')
    const rest = src.slice(start)
    const end = rest.indexOf('export async function PATCH')
    const body = end > -1 ? rest.slice(0, end) : rest
    expect(body).toContain("eq('user_id', auth.user.id)")
    // e retorna o campo route (senão o Story não desenha o traçado)
    expect(body).toContain('route')
  })
})
