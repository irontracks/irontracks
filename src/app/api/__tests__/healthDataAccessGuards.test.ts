/**
 * Guards de CLASSE para acesso a dado sensível de saúde e a conteúdo social.
 *
 * Contexto (auditoria de vazamento de dados — 2026-07-28):
 *
 *  1) Exames laboratoriais eram autorizados por `lab_exams.trainer_id`, coluna
 *     gravada UMA vez na criação e nunca revalidada. Quando o aluno trocava de
 *     personal (ou o vínculo era removido), o ex-professor continuava lendo,
 *     baixando e apagando os exames — porque a linha ainda apontava pra ele.
 *     Três rotas divergiam da irmã `lab-exam-protocol`, que já exigia vínculo
 *     vivo via `canCoachStudent`. O gate correto é sempre o vínculo VIVO em
 *     `students`, nunca um campo auto-declarado da própria linha.
 *
 *  2) `social/stories/comments` lia a story com service-role (RLS off) e não
 *     repetia o filtro `is_deleted`/`expires_at` que a RLS aplica — e ainda
 *     caía em fail-open quando a story não existia (`if (authorId && ...)`).
 *
 * Estes guards varrem a FAMÍLIA inteira de rotas, não os três arquivos que
 * originaram o achado: a próxima rota de exame que nascer copiando o padrão
 * antigo quebra o CI em vez de virar o próximo vazamento.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, 'src/app/api')

/** Todos os route.ts sob /api, recursivo. */
function listRoutes(dir = API_DIR): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRoutes(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f)

const allRoutes = listRoutes()
const labExamRoutes = allRoutes.filter((f) => fs.readFileSync(f, 'utf-8').includes("from('lab_exams')"))

describe('lab_exams — autorização por vínculo vivo', () => {
  it('a varredura encontra as rotas de exame (sanidade)', () => {
    expect(labExamRoutes.length).toBeGreaterThanOrEqual(5)
  })

  it('nenhuma rota usa o trainer_id da linha como credencial de acesso', () => {
    // Anti-padrão exato que causou o vazamento: comparar o caller com o
    // trainer_id gravado no exame. Um vínculo desfeito não apaga essa coluna.
    const antiPattern = /!==\s*(trainerId|exam\.trainer_id|.*\.trainer_id)\b/
    const offenders = labExamRoutes.filter((f) => antiPattern.test(fs.readFileSync(f, 'utf-8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('toda rota de exame com service-role exige vínculo vivo (canCoachStudent ou students.teacher_id)', () => {
    const offenders = labExamRoutes
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8')
        if (!src.includes('createAdminClient')) return false
        const hasLiveLink =
          src.includes('canCoachStudent') ||
          (src.includes("from('students')") && src.includes("eq('teacher_id'"))
        return !hasLiveLink
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})

/**
 * Mesma classe, outra família (31/07/2026): as rotas de IA da Avaliação por Foto
 * já gateavam por `canCoachStudent`, mas as rotas de DADOS da mesma feature
 * (listar/abrir laudo e mintar upload de foto) continuavam comparando o caller
 * com `trainer_id` da linha — e a LISTA ainda filtrava por `trainer_id.eq.`,
 * o que faria uma linha forjada {user_id: vítima, trainer_id: self} aparecer.
 * Foto de corpo inteiro é o dado mais sensível do app; o gate tem que ser o
 * mesmo em toda a família.
 */
describe('body_photo_assessments — autorização por vínculo vivo', () => {
  const bodyPhotoRoutes = allRoutes.filter((f) =>
    fs.readFileSync(f, 'utf-8').includes("from('body_photo_assessments')"),
  )

  it('a varredura encontra as rotas de avaliação por foto (sanidade)', () => {
    expect(bodyPhotoRoutes.length).toBeGreaterThanOrEqual(4)
  })

  it('nenhuma rota usa o trainer_id da linha como credencial de acesso', () => {
    const antiPattern = /!==\s*(trainerId|.*\.trainer_id)\b/
    const offenders = bodyPhotoRoutes.filter((f) => antiPattern.test(fs.readFileSync(f, 'utf-8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('nenhuma listagem filtra por trainer_id — o filtro é pelo DONO da avaliação', () => {
    const offenders = bodyPhotoRoutes.filter((f) => /trainer_id\.eq\./.test(fs.readFileSync(f, 'utf-8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('toda rota com service-role exige vínculo vivo (canCoachStudent/listCoachedStudentIds)', () => {
    const offenders = bodyPhotoRoutes
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8')
        if (!src.includes('createAdminClient')) return false
        const hasLiveLink =
          src.includes('canCoachStudent') ||
          src.includes('listCoachedStudentIds') ||
          (src.includes("from('students')") && src.includes("eq('teacher_id'"))
        return !hasLiveLink
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('/api/admin que aceita teacher — recorte por vínculo', () => {
  // Rotas de admin que também liberam o papel `teacher` e recebem id de usuário
  // no request. `admin/vip/batch-status` aceitava 200 UUIDs quaisquer e devolvia
  // plano/status/expiração de qualquer usuário da base (auditoria 2026-07-28).
  const teacherAllowed = allRoutes.filter((f) => {
    if (!f.replace(/\\/g, '/').includes('/api/admin/')) return false
    const src = fs.readFileSync(f, 'utf-8')
    return /require(Role|RoleOrBearer)\(\s*(req,\s*)?\[[^\]]*'teacher'/.test(src)
  })

  it('a varredura encontra as rotas admin abertas a teacher (sanidade)', () => {
    expect(teacherAllowed.length).toBeGreaterThanOrEqual(8)
  })

  it('as que recebem id de usuário do request recortam pelos alunos do professor', () => {
    const takesTargetId = /user_ids|studentId|student_user_id|targetUserId|\btarget\b/
    const offenders = teacherAllowed
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8')
        if (!takesTargetId.test(src)) return false
        // Formas legítimas de recorte já usadas no repo: consultar o vínculo em
        // `students`, delegar pro helper, ou ramificar explicitamente quando o
        // caller é teacher (o admin segue vendo tudo).
        const scopesToTeacher =
          (src.includes("from('students')") && src.includes("eq('teacher_id'")) ||
          src.includes('canCoachStudent') ||
          src.includes('ownsOrCreated') ||
          /(auth\.role|actorRole)\s*(===|!==)\s*'(teacher|admin)'/.test(src) ||
          /teacher_id\s*!==|currentTeacher|resolvedTeacher/.test(src)
        return !scopesToTeacher
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('/api/teacher — exige papel de professor', () => {
  // Só o singular /api/teacher/ — é a superfície de GESTÃO (o professor agindo
  // sobre alunos e sobre o próprio catálogo). O plural /api/teachers/ é
  // auto-serviço do próprio usuário (me, my-plan, checkout, faturas): filtra
  // pelo id/email de quem chama, então "logado" basta e exigir role ali seria
  // falso positivo.
  const teacherRoutes = allRoutes.filter((f) => f.replace(/\\/g, '/').includes('/api/teacher/'))

  it('a varredura encontra as rotas de gestão do professor (sanidade)', () => {
    expect(teacherRoutes.length).toBeGreaterThanOrEqual(12)
  })

  it('nenhuma se contenta com "usuário logado" onde as irmãs exigem role', () => {
    // service-plans (GET/POST) usava só auth.getUser(): aluno comum entrava na
    // superfície de professor, enquanto service-plans/[id], que mexe na MESMA
    // tabela, exigia requireRole (auditoria 2026-07-28).
    const offenders = teacherRoutes
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8')
        if (!/export async function (GET|POST|PUT|PATCH|DELETE)/.test(src)) return false
        return !/requireRole(OrBearer|WithBearer)?\(/.test(src)
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('social stories — conteúdo de story morta não vaza', () => {
  // Rotas que resolvem uma story a partir de um id do request e devolvem
  // conteúdo dela (ou derivado) usando service-role.
  const storyContentRoutes = allRoutes.filter((f) => {
    const src = fs.readFileSync(f, 'utf-8')
    return (
      src.includes("from('social_stories')") &&
      src.includes('createAdminClient') &&
      /storyId/.test(src) &&
      /\/(comments|media)\//.test(f.replace(/\\/g, '/'))
    )
  })

  it('a varredura encontra as rotas de conteúdo de story (sanidade)', () => {
    expect(storyContentRoutes.length).toBeGreaterThanOrEqual(2)
  })

  it('todas checam is_deleted e expires_at antes de expor conteúdo', () => {
    const offenders = storyContentRoutes
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8')
        return !(src.includes('is_deleted') && src.includes('expires_at'))
      })
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('todas rejeitam explicitamente story ausente antes de decidir acesso', () => {
    // Sem uma guarda de ausência, `if (authorId && authorId !== me)` pula a
    // checagem de follow quando a story sumiu — fail-open. O correto é 404
    // antes de ler qualquer conteúdo.
    // (Este guard é positivo de propósito: proibir o idiom `if (authorId &&`
    // dava falso positivo em usos legítimos — montagem de notificação e o POST
    // de media, que lê com client do usuário e já tem a RLS aplicada.)
    const offenders = storyContentRoutes
      .filter((f) => !/if\s*\(\s*!\s*(story|authorId)|!story\?\.\w+\)/.test(fs.readFileSync(f, 'utf-8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
