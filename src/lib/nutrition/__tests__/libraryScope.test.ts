/**
 * A biblioteca de alimentos é COMPARTILHADA entre parceiros de dieta desde
 * 07/09/2026 (pedido do dono: ele e a Fran moram juntos e comem a mesma coisa).
 *
 * Dois riscos guardados aqui:
 *
 *  1. Um leitor NOVO que filtre `.eq('user_id', …)` volta a mostrar só a
 *     biblioteca própria — e some, sem erro, com o alimento que o parceiro
 *     cadastrou. Eram SETE leitores quando isto foi escrito; o oitavo é que
 *     preocupa.
 *  2. Alguém "simplificar" apagando o filtro e deixando só a RLS. Não dá: os
 *     leitores recebem o `SupabaseClient` por injeção e nada garante que o
 *     chamador não passe um cliente service-role, que ignora RLS — nesse
 *     caminho a consulta serviria a biblioteca de TODOS os usuários.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveLibraryUserIds } from '../libraryScope'

/** Cliente mínimo: só o encadeamento que `resolveLibraryUserIds` usa. */
const clienteFake = (resposta: { data?: unknown; error?: unknown }) => ({
  from: () => ({ select: () => ({ eq: async () => resposta }) }),
}) as never

describe('resolveLibraryUserIds', () => {
  it('devolve o próprio id PRIMEIRO, com os parceiros depois', async () => {
    const ids = await resolveLibraryUserIds(clienteFake({ data: [{ user_id: 'fran' }] }), 'mk')
    expect(ids).toEqual(['mk', 'fran'])
  })

  it('sem parceiro, devolve só o próprio id', async () => {
    expect(await resolveLibraryUserIds(clienteFake({ data: [] }), 'mk')).toEqual(['mk'])
  })

  it('erro de leitura degrada para a biblioteca própria, nunca para vazio', async () => {
    // O supabase-js NÃO lança em erro de leitura — devolve `{ error }`. Sem
    // destruturar, uma falha viraria "sem parceiro" e, pior, um `.in()` com
    // lista vazia devolveria ZERO alimentos: o lançamento de refeição pararia
    // de reconhecer o que o próprio usuário cadastrou.
    const ids = await resolveLibraryUserIds(clienteFake({ error: { message: 'boom' } }), 'mk')
    expect(ids).toEqual(['mk'])
  })

  it('cliente que explode não derruba o chamador', async () => {
    const explode = { from: () => { throw new Error('offline') } } as never
    expect(await resolveLibraryUserIds(explode, 'mk')).toEqual(['mk'])
  })

  it('sem usuário devolve lista vazia (não há biblioteca a servir)', async () => {
    expect(await resolveLibraryUserIds(clienteFake({ data: [] }), '')).toEqual([])
    expect(await resolveLibraryUserIds(clienteFake({ data: [] }), null)).toEqual([])
  })

  it('ignora o próprio id repetido e parceiro duplicado', async () => {
    const ids = await resolveLibraryUserIds(
      clienteFake({ data: [{ user_id: 'mk' }, { user_id: 'fran' }, { user_id: 'fran' }] }),
      'mk',
    )
    expect(ids).toEqual(['mk', 'fran'])
  })
})

describe('varredura — nenhum leitor da biblioteca filtra por um usuário só', () => {
  const raiz = join(process.cwd(), 'src')

  const arquivos = (function varrer(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue
        out.push(...varrer(p))
      } else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
  })(raiz)

  /** Fatia cada `.from('nutrition_custom_foods')` até o fim do encadeamento. */
  const consultas = (src: string): string[] => {
    const out: string[] = []
    const agulha = ".from('nutrition_custom_foods')"
    let de = 0
    for (;;) {
      const at = src.indexOf(agulha, de)
      if (at === -1) break
      // Até o primeiro `;` ou o fim de uma linha que não continue o encadeamento.
      const fim = src.indexOf(';', at)
      out.push(src.slice(at, fim === -1 ? Math.min(src.length, at + 600) : fim))
      de = at + agulha.length
    }
    return out
  }

  it('quem LÊ a biblioteca usa resolveLibraryUserIds', () => {
    const infratores: string[] = []
    for (const f of arquivos) {
      if (f.endsWith('libraryScope.ts') || f.endsWith('supabase.ts')) continue
      const src = readFileSync(f, 'utf8')
      if (!src.includes("from('nutrition_custom_foods')")) continue
      for (const q of consultas(src)) {
        // Escrita (insert) nasce sempre na conta de quem cadastra — `user_id`
        // ali é correto e não é leitura.
        if (/\.insert\(/.test(q)) continue
        // Update/delete por id: quem autoriza é a RLS (a linha é compartilhada).
        if (/\.(update|delete)\(/.test(q)) {
          if (/\.eq\(\s*['"]user_id['"]/.test(q)) {
            infratores.push(`${f.replace(process.cwd() + '/', '')}: update/delete preso ao dono`)
          }
          continue
        }
        if (/\.eq\(\s*['"]user_id['"]/.test(q)) {
          infratores.push(`${f.replace(process.cwd() + '/', '')}: lê a biblioteca de um usuário só`)
        }
      }
    }
    expect(
      infratores,
      'a biblioteca é compartilhada com o parceiro de dieta — filtrar por um user_id ' +
        'esconde, sem erro, o alimento que o outro cadastrou. Use resolveLibraryUserIds + .in()',
    ).toEqual([])
  })

  it('o guard enxerga os leitores (não está varrendo o vazio)', () => {
    const comLeitura = arquivos.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return src.includes("from('nutrition_custom_foods')") && src.includes('resolveLibraryUserIds')
    })
    expect(comLeitura.length).toBeGreaterThanOrEqual(6)
  })
})
