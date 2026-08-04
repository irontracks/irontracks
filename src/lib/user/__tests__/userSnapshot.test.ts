import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'

import { buildUserSnapshot } from '../snapshot'

/**
 * userSnapshot — o leitor único dos dados do usuário.
 *
 * O que estes testes protegem, em ordem de importância:
 *  1. Que ele resolve os fatos do jeito que o app EXIBE (meta salva > TDEE), porque
 *     é essa sequência — não a conta — que estava copiada em três superfícies.
 *  2. Que ele continua BARATO: setor não pedido não vira query, e a coluna
 *     `workouts.notes` (a sessão inteira serializada) nunca entra num `select`.
 *  3. Que ele nunca lança: um setor que falha vira `null` sem derrubar os outros.
 */

type Row = Record<string, unknown> | null

/** Mock encadeável no padrão do repo (modelo: `utils/__tests__/authRole.test.ts`). */
const makeSupabase = (rows: { user_settings?: Row; nutrition_goals?: Row }, opts: { throwOn?: string } = {}) => {
  const selects: { table: string; columns: string }[] = []
  const from = vi.fn().mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {}
    const ret = () => chain
    chain.select = vi.fn().mockImplementation((columns: string) => {
      selects.push({ table, columns })
      return chain
    })
    chain.eq = vi.fn().mockImplementation(ret)
    chain.order = vi.fn().mockImplementation(ret)
    chain.limit = vi.fn().mockImplementation(ret)
    chain.maybeSingle = vi.fn().mockImplementation(async () => {
      if (opts.throwOn === table) throw new Error('boom')
      return { data: (rows as Record<string, Row>)[table] ?? null }
    })
    return chain
  })
  return { client: { from } as never, from, selects }
}

const PERFIL_COMPLETO = {
  bodyWeightKg: 93.9,
  heightCm: 178,
  age: 34,
  biologicalSex: 'male',
  fitnessGoal: 'hypertrophy',
  fitnessLevel: 'advanced',
  trainingExperienceYears: 6,
  trainingFrequencyPerWeek: 5,
}

describe('userSnapshot — setor profile', () => {
  it('extrai a antropometria declarada e monta as stats do motor de TDEE', async () => {
    const { client } = makeSupabase({ user_settings: { preferences: PERFIL_COMPLETO } })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])

    expect(snap.profile?.bodyWeightKg).toBe(93.9)
    expect(snap.profile?.heightCm).toBe(178)
    expect(snap.profile?.age).toBe(34)
    expect(snap.profile?.biologicalSex).toBe('male')
    expect(snap.profile?.stats).toMatchObject({ weight: 93.9, height: 178, age: 34, gender: 'MALE' })
  })

  it('separa a fase ESCOLHIDA da fase que vale — o fallback não é escolha do usuário', async () => {
    const { client } = makeSupabase({ user_settings: { preferences: PERFIL_COMPLETO } })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])

    // Nunca escolheu fase; hipertrofia cai em BULK pelo fallback legado.
    expect(snap.profile?.nutritionPhaseExplicit).toBeNull()
    expect(snap.profile?.nutritionPhase).toBe('BULK')
  })

  it('a fase escolhida manda sobre o objetivo de treino', async () => {
    const { client } = makeSupabase({
      user_settings: { preferences: { ...PERFIL_COMPLETO, nutritionPhase: 'CUT' } },
    })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])

    expect(snap.profile?.nutritionPhaseExplicit).toBe('CUT')
    expect(snap.profile?.nutritionPhase).toBe('CUT')
  })

  it('"não informado" não vira sexo — sem ele não há BMR', async () => {
    const { client } = makeSupabase({
      user_settings: { preferences: { ...PERFIL_COMPLETO, biologicalSex: 'not_informed' } },
    })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])

    expect(snap.profile?.biologicalSex).toBeNull()
    expect(snap.profile?.stats).toBeNull()
  })

  it('sem perfil salvo, o setor é null (e não um objeto de campos vazios)', async () => {
    const { client } = makeSupabase({ user_settings: null })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])
    expect(snap.profile).toBeNull()
  })
})

describe('userSnapshot — setor nutrition', () => {
  it('usa a meta SALVA quando ela existe e diz que é salva', async () => {
    const { client } = makeSupabase({
      user_settings: { preferences: PERFIL_COMPLETO },
      nutrition_goals: { calories: 3100, protein: 200, carbs: 350, fat: 90 },
    })
    const snap = await buildUserSnapshot(client, 'u1', ['nutrition'])

    expect(snap.nutrition?.targetsSource).toBe('saved')
    expect(snap.nutrition?.targets).toEqual({ calories: 3100, protein: 200, carbs: 350, fat: 90 })
  })

  it('sem meta salva, deriva do TDEE do perfil — e marca como derivada', async () => {
    const { client } = makeSupabase({ user_settings: { preferences: PERFIL_COMPLETO } })
    const snap = await buildUserSnapshot(client, 'u1', ['nutrition'])

    expect(snap.nutrition?.targetsSource).toBe('derived')
    expect(snap.nutrition?.targets?.calories).toBeGreaterThan(0)
  })

  it('perfil incompleto e sem meta salva não inventa número', async () => {
    const { client } = makeSupabase({ user_settings: { preferences: { fitnessGoal: 'hypertrophy' } } })
    const snap = await buildUserSnapshot(client, 'u1', ['nutrition'])

    expect(snap.nutrition?.targets).toBeNull()
    expect(snap.nutrition?.targetsSource).toBeNull()
  })
})

describe('userSnapshot — custo e resiliência', () => {
  it('setor não pedido não é montado', async () => {
    const { client, selects } = makeSupabase({
      user_settings: { preferences: PERFIL_COMPLETO },
      nutrition_goals: { calories: 3100, protein: 200, carbs: 350, fat: 90 },
    })
    const snap = await buildUserSnapshot(client, 'u1', ['profile'])

    expect(snap.nutrition).toBeNull()
    expect(selects.some((s) => s.table === 'nutrition_goals')).toBe(false)
  })

  it('sem setores ou sem usuário, não faz query nenhuma', async () => {
    const { client, from } = makeSupabase({ user_settings: { preferences: PERFIL_COMPLETO } })
    expect(await buildUserSnapshot(client, 'u1', [])).toEqual({ profile: null, nutrition: null })
    expect(await buildUserSnapshot(client, '', ['profile'])).toEqual({ profile: null, nutrition: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('uma leitura que falha vira null naquele setor, sem lançar para o chamador', async () => {
    const { client } = makeSupabase(
      { user_settings: { preferences: PERFIL_COMPLETO } },
      { throwOn: 'nutrition_goals' },
    )
    const snap = await buildUserSnapshot(client, 'u1', ['profile', 'nutrition'])

    expect(snap.nutrition).toBeNull()
    // O setor vizinho sobrevive — é o ponto de degradar por setor.
    expect(snap.profile?.bodyWeightKg).toBe(93.9)
  })

  it('nunca seleciona `notes`: a sessão inteira mora nessa coluna', async () => {
    const { client, selects } = makeSupabase({
      user_settings: { preferences: PERFIL_COMPLETO },
      nutrition_goals: { calories: 3100, protein: 200, carbs: 350, fat: 90 },
    })
    await buildUserSnapshot(client, 'u1', ['profile', 'nutrition'])

    expect(selects.length).toBeGreaterThan(0)
    for (const s of selects) expect(s.columns).not.toMatch(/\bnotes\b/)
  })
})

/**
 * Source-guard da duplicação que este módulo veio matar.
 *
 * `userContext.ts` extraía `bodyWeightKg`/`heightCm`/`age`/`biologicalSex` por conta
 * própria, em paralelo com `extractProfileStats`. Duas leituras independentes das
 * mesmas chaves não quebram nada HOJE — quebram no dia em que o perfil ganhar um
 * campo e só um lado for atualizado, sem erro nenhum para denunciar.
 */
describe('userContext — não volta a ler o perfil por conta própria', () => {
  /** Reduz ao código executável: a documentação do proibido cita as chaves. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const code = stripComments(
    readFileSync(join(__dirname, '..', '..', '..', 'utils', 'ai', 'userContext.ts'), 'utf8'),
  )

  /**
   * O alvo é a FONTE, não o nome dos campos: `p.bodyWeightKg` lido do snapshot é
   * exatamente o certo, e um guard contra esses nomes acusaria o consumo correto.
   * Sem ler a tabela, não há como reextrair o perfil — a única entrada é o snapshot.
   */
  it.each(['user_settings', 'nutrition_goals'])('não lê `%s` direto', (tabela) => {
    expect(code).not.toMatch(new RegExp(`from\\(['"]${tabela}['"]\\)`))
  })

  it('não pega o objeto cru de preferências para extrair campo por campo', () => {
    expect(code).not.toMatch(/select\(['"]preferences['"]\)/)
  })

  it('os fatos do usuário entram pelo snapshot', () => {
    expect(code).toMatch(/buildUserSnapshot/)
  })
})
