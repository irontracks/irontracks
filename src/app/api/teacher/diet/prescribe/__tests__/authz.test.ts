import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Professor prescreve plano alimentar PRO ALUNO. Guards de regressão (source-guards):
 * só admin/teacher; canCoachStudent (só aluno DELE, anti-IDOR); cota na conta do professor;
 * grava via service-role com dono = aluno e autor = professor; arquiva o plano anterior;
 * não vaza erro cru do Postgres. O motor de geração é compartilhado com o self-service e
 * DEVE recomputar os macros no servidor (nunca confiar na aritmética do LLM). As rotas de
 * leitura (professor / aluno) usam a superfície de auth certa.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('rota teacher/diet/prescribe', () => {
  const src = stripComments(readFileSync('src/app/api/teacher/diet/prescribe/route.ts', 'utf8'))

  it('exige role admin/teacher', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
  })

  it('valida o vínculo com canCoachStudent (fail-closed)', () => {
    expect(src).toMatch(/canCoachStudent\(/)
    expect(src).toMatch(/forbidden/)
  })

  it('checa e mete a cota na conta do professor', () => {
    expect(src).toMatch(/checkVipFeatureAccess\([^)]*teacherId/)
    expect(src).toMatch(/incrementVipUsage\([^)]*teacherId/)
  })

  it('gera com o repertório do ALUNO e persiste com dono = aluno, autor = professor', () => {
    expect(src).toMatch(/generateDietPlan\(/)
    expect(src).toMatch(/sourceUserId:\s*studentId/)
    expect(src).toMatch(/user_id:\s*studentId/)
    expect(src).toMatch(/created_by:\s*teacherId/)
  })

  it('grava via service-role (createAdminClient), não pelo client do usuário', () => {
    expect(src).toMatch(/createAdminClient\(\)/)
  })

  it('arquiva o plano ativo anterior (um plano ativo por aluno)', () => {
    expect(src).toMatch(/status:\s*['"]archived['"]/)
    expect(src).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/)
  })

  it('erro de DB NÃO vaza a mensagem crua do Postgres (loga + código genérico)', () => {
    expect(src).not.toMatch(/insErr\.message/)
    expect(src).toMatch(/logError\('teacher-diet:/)
    expect(src).toMatch(/error:\s*['"]database_error['"]/)
  })
})

describe('motor compartilhado (lib/nutrition/dietGenerate)', () => {
  const engine = stripComments(readFileSync('src/lib/nutrition/dietGenerate.ts', 'utf8'))

  it('lê o repertório/contexto da ORIGEM (sourceUserId), não hardcoded', () => {
    expect(engine).toMatch(/buildFoodProfile\(\s*supabase\s*,\s*sourceUserId\s*\)/)
    expect(engine).toMatch(/buildUserContextBlock\(\s*supabase\s*,\s*sourceUserId/)
  })

  it('RECOMPUTA os macros no servidor — nunca confia na aritmética do LLM', () => {
    // Recomputa item a item (sumItems) e arredonda; não devolve os totais crus do modelo.
    expect(engine).toMatch(/sumItems\(/)
    expect(engine).toMatch(/Math\.round/)
  })
})

describe('rota self-service ai/diet-generate reusa o MESMO motor', () => {
  const vip = stripComments(readFileSync('src/app/api/ai/diet-generate/route.ts', 'utf8'))

  it('a rota do aluno chama generateDietPlan com sourceUserId = próprio userId', () => {
    expect(vip).toMatch(/generateDietPlan\(/)
    expect(vip).toMatch(/sourceUserId:\s*userId/)
  })
})

describe('rota teacher/diet/plan (leitura pelo professor)', () => {
  const src = stripComments(readFileSync('src/app/api/teacher/diet/plan/route.ts', 'utf8'))

  it('exige role admin/teacher e valida canCoachStudent', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
    expect(src).toMatch(/canCoachStudent\(/)
    expect(src).toMatch(/forbidden/)
  })

  it('lê só o plano ATIVO do aluno via service-role', () => {
    expect(src).toMatch(/createAdminClient\(\)/)
    expect(src).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/)
  })
})

describe('rota nutrition/prescribed-plan (leitura pelo ALUNO)', () => {
  const src = stripComments(readFileSync('src/app/api/nutrition/prescribed-plan/route.ts', 'utf8'))

  it('usa o client autenticado do aluno (RLS), NUNCA service-role', () => {
    expect(src).toMatch(/requireUser\(\)/)
    expect(src).toMatch(/auth\.supabase/)
    expect(src).not.toMatch(/createAdminClient/)
  })

  it('filtra pelo próprio user_id e status ativo', () => {
    expect(src).toMatch(/\.eq\(\s*['"]user_id['"]\s*,\s*userId\s*\)/)
    expect(src).toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/)
  })
})

describe('migration student_diet_plans (RLS)', () => {
  const sql = readFileSync('supabase/migrations/20260718050000_student_diet_plans.sql', 'utf8')

  it('habilita RLS na tabela', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
  })

  it('deixa o aluno ler SÓ o próprio plano (select_own = auth.uid())', () => {
    expect(sql).toMatch(/student_diet_plans_select_own/)
    expect(sql).toMatch(/FOR SELECT\s+USING\s*\(\s*user_id\s*=\s*\(\s*SELECT auth\.uid\(\)\s*\)\s*\)/i)
  })

  it('NÃO cria policy de INSERT/UPDATE pro usuário (escrita só via service-role)', () => {
    // A brecha de self-grant do VIP nasceu de policy de escrita pro authenticated. Aqui só
    // pode haver a policy admin (is_admin) e a de leitura própria — nada de INSERT/UPDATE.
    expect(sql).not.toMatch(/FOR INSERT/i)
    expect(sql).not.toMatch(/FOR UPDATE/i)
  })
})

describe('visibilidade do plano pro aluno (NutritionMixer)', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')

  it('renderiza PrescribedDietPlan (o aluno vê o plano prescrito)', () => {
    expect(src).toMatch(/<PrescribedDietPlan/)
  })

  it('NÃO gateia o plano prescrito por canViewMacros (aluno FREE com professor precisa ver)', () => {
    // Regressão da revisão: o gate canViewMacros escondia a dieta prescrita de alunos sem VIP
    // próprio. O bloco entre o marcador e o componente não pode reintroduzir esse gate.
    const marker = 'PLANO PRESCRITO PELO PROFESSOR'
    const start = src.indexOf(marker)
    const compAt = src.indexOf('<PrescribedDietPlan', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(compAt).toBeGreaterThan(start)
    const guardBlock = src.slice(start, compAt)
    expect(guardBlock).not.toMatch(/canViewMacros\s*&&/)
  })
})
