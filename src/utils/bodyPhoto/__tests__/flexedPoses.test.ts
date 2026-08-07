import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  BODY_PHOTO_FLEXED_POSES,
  BODY_PHOTO_POSES,
  BODY_PHOTO_RELAXED_POSES,
  isFlexedPose,
  POSE_INSTRUCTIONS_PT,
  POSE_LABELS_PT,
} from '@/types/bodyPhotoAssessment'

/**
 * Poses contraídas (ago/2026) — três fotos OPCIONAIS além das relaxadas.
 *
 * A decisão que estes guards protegem: contração revela desenvolvimento e
 * assimetria, mas AUMENTA a definição aparente. Se as contraídas entrarem na
 * estimativa de gordura, o laudo passa a subestimar o BF — seria trocar precisão
 * de composição por precisão de músculo. A separação vive no prompt, e é a
 * primeira coisa que se perde numa reescrita descuidada.
 */

const SRC = join(__dirname, '..', '..', '..')
const ROUTE = join(SRC, 'app', 'api', 'ai', 'body-composition-photo', 'route.ts')

describe('poses — catálogo', () => {
  it('são seis: três relaxadas e três contraídas', () => {
    expect(BODY_PHOTO_RELAXED_POSES).toEqual(['front', 'side', 'back'])
    expect(BODY_PHOTO_FLEXED_POSES).toEqual(['front_flex', 'side_flex', 'back_flex'])
    expect(BODY_PHOTO_POSES).toHaveLength(6)
  })

  it('as relaxadas vêm primeiro — é a ordem em que o modelo lê as fotos', () => {
    expect(BODY_PHOTO_POSES.slice(0, 3)).toEqual([...BODY_PHOTO_RELAXED_POSES])
  })

  it('isFlexedPose separa as duas famílias', () => {
    for (const p of BODY_PHOTO_RELAXED_POSES) expect(isFlexedPose(p)).toBe(false)
    for (const p of BODY_PHOTO_FLEXED_POSES) expect(isFlexedPose(p)).toBe(true)
  })

  it('toda pose tem rótulo e instrução — o card e o prompt leem daqui', () => {
    for (const p of BODY_PHOTO_POSES) {
      expect(POSE_LABELS_PT[p]?.length ?? 0).toBeGreaterThan(0)
      expect(POSE_INSTRUCTIONS_PT[p]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('a instrução das contraídas nomeia a pose de palco (o modelo conhece o termo)', () => {
    expect(POSE_INSTRUCTIONS_PT.front_flex.toLowerCase()).toContain('double biceps')
    expect(POSE_INSTRUCTIONS_PT.side_flex.toLowerCase()).toContain('side chest')
    expect(POSE_INSTRUCTIONS_PT.back_flex.toLowerCase()).toContain('lat spread')
  })
})

describe('prompt do laudo — quem responde o quê', () => {
  const code = readFileSync(ROUTE, 'utf8')
  // Recorta só o PROMPT: procurar no arquivo inteiro casaria com comentários.
  const prompt = code.slice(code.indexOf('const PROMPT = ['), code.indexOf('export async function POST'))

  it('a gordura sai APENAS das relaxadas — a regra que impede subestimar o BF', () => {
    expect(prompt).toMatch(/bodyFatRange[^\n]*APENAS as fotos RELAXADAS/)
  })

  it('desenvolvimento e simetria preferem as contraídas', () => {
    expect(prompt).toMatch(/muscleGroups[\s\S]{0,120}CONTRAÍDAS/)
  })

  it('postura continua nas relaxadas (a pose contraída distorce ombros)', () => {
    expect(prompt).toMatch(/posture e proportions[^\n]*RELAXADAS/)
  })

  it('anuncia até 6 fotos — senão o modelo trata as extras como ruído', () => {
    expect(prompt).toContain('1 a 6 fotos')
  })
})

describe('rota — a foto chega rotulada', () => {
  const code = readFileSync(ROUTE, 'utf8')
  const executavel = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  it('o rótulo diz RELAXADA/CONTRAÍDA — é o gatilho da regra do prompt', () => {
    expect(executavel).toContain("isFlexedPose(ph.pose) ? 'CONTRAÍDA' : 'RELAXADA'")
    expect(executavel).toMatch(/parts\.push\(\{[\s\S]{0,200}\$\{tipo\}/)
  })

  it('a ordem das fotos vem do catálogo, não de uma lista escrita à mão', () => {
    expect(executavel).toMatch(/POSE_ORDER[^\n]*=\s*\[\.\.\.BODY_PHOTO_POSES\]/)
  })
})

describe('banco — o CHECK aceita as seis poses', () => {
  const dir = join(SRC, '..', 'supabase', 'migrations')
  // A migration mais recente que mexe no CHECK de pose é a que vale.
  const arquivo = readdirSync(dir).filter((f) => f.includes('body_photo_add_flexed_poses')).sort().pop()

  it('a migration existe no repo (o MCP aplica no banco, não no git)', () => {
    expect(arquivo).toBeTruthy()
  })

  it('lista as seis poses no constraint', () => {
    const sql = readFileSync(join(dir, arquivo as string), 'utf8')
    for (const p of BODY_PHOTO_POSES) expect(sql).toContain(`'${p}'`)
  })
})
