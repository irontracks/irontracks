/**
 * Importar treino por foto/PDF — o que a ficha vira dentro do app.
 *
 * O risco desta feature não é o app quebrar: é ele INVENTAR treino. A IA lê
 * letra de personal em papel amassado, e cada campo que ela "completa" sozinha
 * vira carga que o usuário nunca escreveu. Os casos abaixo travam as três
 * decisões que impedem isso:
 *
 *  1. campo ausente continua ausente (null), nunca vira 0/valor plausível;
 *  2. nome passa pela canonização — senão "Supino Retão" nasce como exercício
 *     NOVO e o motor de carga automática perde o histórico (o histórico casa
 *     por NOME);
 *  3. lixo não vira treino: ficha ilegível devolve lista vazia, e a rota trata
 *     isso como "não consegui ler" em vez de entregar um treino em branco.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeExtractedWorkouts, METHOD_TO_EDITOR } from '../workoutPhotoNormalize'
import {
  WorkoutPhotoExtractedSchema,
  PHOTO_IMPORT_LIMITS,
  PHOTO_IMPORT_METHODS,
} from '@/schemas/workoutPhotoImport'
import { EDITOR_METHODS } from '@/components/workout/helpers/editorMethod'

const raiz = process.cwd()

/** Resposta típica do modelo lendo uma ficha de papel. */
const CRU_TIPICO = {
  workouts: [
    {
      title: 'Treino A - Peito',
      exercises: [
        { name: 'Supino reto', sets: 4, reps: '8-12', weightKg: 60, cadence: null, restSeconds: 90, rpe: 9, method: 'normal', notes: null },
        { name: 'Crucifixo', sets: 3, reps: '12', weightKg: null, cadence: null, restSeconds: null, rpe: null, method: 'drop_set', notes: 'só na última' },
      ],
    },
  ],
}

describe('normalização — o que a ficha não diz continua não dito', () => {
  it('campo ausente vira null, não zero', () => {
    const { workouts } = normalizeExtractedWorkouts(CRU_TIPICO)
    const crucifixo = workouts[0].exercises[1]
    expect(crucifixo.weightKg).toBeNull()
    expect(crucifixo.rpe).toBeNull()
    expect(crucifixo.restSeconds).toBeNull()
    expect(crucifixo.cadence).toBeNull()
  })

  it('string vazia e lixo também viram null (não 0)', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: 'Remada', sets: '', reps: '', weightKg: 'não sei', rpe: '-' }] }],
    })
    const ex = workouts[0].exercises[0]
    expect(ex.sets).toBeNull()
    expect(ex.reps).toBeNull()
    expect(ex.weightKg).toBeNull()
    expect(ex.rpe).toBeNull()
  })

  it('preserva a FAIXA de repetições — "8-12" não vira 8 nem 12', () => {
    const { workouts } = normalizeExtractedWorkouts(CRU_TIPICO)
    expect(workouts[0].exercises[0].reps).toBe('8-12')
  })

  it('reps que vem como NÚMERO (modelo ignorando o schema) vira texto, não null', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: 'Agachamento', reps: 10 }] }],
    })
    expect(workouts[0].exercises[0].reps).toBe('10')
  })

  it('clampa valores fora da realidade em vez de aceitar', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: 'Leg press', sets: 99, weightKg: 9000, rpe: 42 }] }],
    })
    const ex = workouts[0].exercises[0]
    expect(ex.sets).toBe(20)
    expect(ex.weightKg).toBe(500)
    expect(ex.rpe).toBe(10)
  })
})

describe('nome do exercício entra no vocabulário do app', () => {
  it('canoniza e guarda o original para a UI mostrar', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: 'panturrilha sentado' }] }],
    })
    const ex = workouts[0].exercises[0]
    expect(ex.name).toBe('Elevação de panturrilha sentada')
    // Sem isto o usuário vê um nome que não é o que ele escreveu e não entende
    // de onde veio.
    expect(ex.originalName).toBe('panturrilha sentado')
  })

  it('nome que já está certo não ganha "originalName"', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: 'Mesa flexora' }] }],
    })
    expect(workouts[0].exercises[0].originalName).toBeUndefined()
  })
})

describe('lixo não vira treino', () => {
  it('exercício sem nome é descartado', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [{ name: '', sets: 3 }, { name: 'Supino', sets: 3 }] }],
    })
    expect(workouts[0].exercises).toHaveLength(1)
  })

  it('treino que ficou sem exercício some — não vai vazio para a revisão', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'A', exercises: [] }, { title: 'B', exercises: [{ name: 'Supino' }] }],
    })
    expect(workouts).toHaveLength(1)
    expect(workouts[0].title).toBe('B')
  })

  it('resposta vazia/ilegível devolve lista vazia (a rota transforma em erro honesto)', () => {
    expect(normalizeExtractedWorkouts({ workouts: [] }).workouts).toEqual([])
    expect(normalizeExtractedWorkouts(null).workouts).toEqual([])
    expect(normalizeExtractedWorkouts('a foto está escura').workouts).toEqual([])
  })

  it('treino sem título ganha número em vez de vir em branco', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ exercises: [{ name: 'Supino' }] }],
    })
    expect(workouts[0].title).toBe('Treino 1')
  })
})

describe('tetos — o normalizador é o juiz, não o responseSchema', () => {
  it('corta acima do limite de treinos e de exercícios', () => {
    const muitos = {
      workouts: Array.from({ length: 12 }, (_, i) => ({
        title: `T${i}`,
        exercises: Array.from({ length: 40 }, (_, j) => ({ name: `Ex ${j}` })),
      })),
    }
    const { workouts } = normalizeExtractedWorkouts(muitos)
    expect(workouts).toHaveLength(PHOTO_IMPORT_LIMITS.maxWorkouts)
    expect(workouts[0].exercises).toHaveLength(PHOTO_IMPORT_LIMITS.maxExercisesPerWorkout)
  })

  it('trunca texto estourado em vez de rejeitar a ficha inteira', () => {
    const { workouts } = normalizeExtractedWorkouts({
      workouts: [{ title: 'T'.repeat(300), exercises: [{ name: 'N'.repeat(300), notes: 'x'.repeat(900) }] }],
    })
    expect(workouts[0].title.length).toBeLessThanOrEqual(PHOTO_IMPORT_LIMITS.workoutTitle)
    expect(workouts[0].exercises[0].name.length).toBeLessThanOrEqual(PHOTO_IMPORT_LIMITS.exerciseName)
    expect((workouts[0].exercises[0].notes ?? '').length).toBeLessThanOrEqual(PHOTO_IMPORT_LIMITS.notes)
  })

  it('o normalizado passa no Zod — normaliza, DEPOIS valida', () => {
    const normalized = normalizeExtractedWorkouts(CRU_TIPICO)
    expect(WorkoutPhotoExtractedSchema.safeParse(normalized).success).toBe(true)
  })
})

describe('método vira a grafia do editor', () => {
  it('todo método do enum tem destino conhecido', () => {
    for (const m of PHOTO_IMPORT_METHODS) {
      expect(METHOD_TO_EDITOR).toHaveProperty(m)
    }
  })

  it('o destino é uma opção REAL do dropdown do editor', () => {
    // `ex.method` fora de `EDITOR_METHODS` faz o select cair em "Normal" e o
    // método se perde ao salvar (bug documentado em editorMethod.ts).
    for (const destino of Object.values(METHOD_TO_EDITOR)) {
      if (destino === null) continue
      expect(EDITOR_METHODS as readonly string[]).toContain(destino)
    }
  })

  it('"normal" não vira método nenhum', () => {
    expect(METHOD_TO_EDITOR.normal).toBeNull()
  })
})

describe('contrato com o Gemini', () => {
  const CONTRACTS = readFileSync(join(raiz, 'src/utils/ai/routeContracts.ts'), 'utf8')
  const ROTA = readFileSync(join(raiz, 'src/app/api/ai/workout-photo-extract/route.ts'), 'utf8')

  it('o schema vai NA CHAMADA, não só no texto do prompt', () => {
    expect(CONTRACTS).toMatch(/WORKOUT_PHOTO_RESPONSE_SCHEMA/)
    expect(CONTRACTS).toMatch(/responseMimeType: 'application\/json'/)
    expect(ROTA).toMatch(/workoutPhotoGenerationConfig\(\)/)
  })

  it('o enum de método do schema espelha o Zod', () => {
    const bloco = CONTRACTS.slice(CONTRACTS.indexOf('const PHOTO_IMPORT_EXERCISE'))
    for (const m of PHOTO_IMPORT_METHODS) {
      expect(bloco).toContain(`'${m}'`)
    }
  })

  it('não tem maxItems no schema aninhado — foi o que derrubou o muscle-map', () => {
    // "too many states for serving" (400) com array dentro de array. O teto real
    // vive no normalizador.
    const bloco = CONTRACTS.slice(CONTRACTS.indexOf('export const WORKOUT_PHOTO_RESPONSE_SCHEMA'))
      .slice(0, CONTRACTS.slice(CONTRACTS.indexOf('export const WORKOUT_PHOTO_RESPONSE_SCHEMA')).indexOf('workoutPhotoGenerationConfig'))
    expect(bloco).not.toContain('maxItems')
  })

  it('usa o modelo rápido — extração de documento não é julgamento visual', () => {
    expect(ROTA).toMatch(/env\.gemini\.fastModelId/)
    expect(ROTA).not.toMatch(/env\.gemini\.modelId/)
  })

  it('declara maxDuration alto: ler várias páginas passa dos 30s da Vercel', () => {
    expect(ROTA).toMatch(/export const maxDuration = 120/)
  })
})

describe('privacidade — a ficha não fica no nosso storage', () => {
  const ROTA = readFileSync(join(raiz, 'src/app/api/ai/workout-photo-extract/route.ts'), 'utf8')
  const MIGRATION = readFileSync(
    join(raiz, 'supabase/migrations/20260819210000_workout_photo_imports.sql'),
    'utf8',
  )

  it('apaga os arquivos do bucket depois de extrair', () => {
    expect(ROTA).toMatch(/purgeFiles\(/)
    expect(ROTA).toMatch(/storage\.from\(BUCKET\)\.remove\(/)
  })

  it('o bucket é PRIVADO', () => {
    expect(MIGRATION).toMatch(/'workout-imports', 'workout-imports', false/)
  })

  it('RLS ligado nas duas tabelas', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.workout_photo_imports ENABLE ROW LEVEL SECURITY/)
    expect(MIGRATION).toMatch(/ALTER TABLE public\.workout_photo_import_files ENABLE ROW LEVEL SECURITY/)
  })
})

describe('gate de acesso', () => {
  const CREATE = readFileSync(join(raiz, 'src/app/api/workout-photo-import/create/route.ts'), 'utf8')
  const EXTRACT = readFileSync(join(raiz, 'src/app/api/ai/workout-photo-extract/route.ts'), 'utf8')
  const ACCESS = readFileSync(join(raiz, 'src/utils/vip/workoutImportAccess.ts'), 'utf8')

  it('a porta de entrada é o /create — não a extração', () => {
    // Travar só na extração deixaria o free com a foto já no nosso bucket e sem
    // o valor que ele veio buscar (lição do lab-exams).
    expect(CREATE).toMatch(/checkWorkoutImportAccess\(auth\.supabase, userId, 'create'\)/)
    expect(EXTRACT).toMatch(/checkWorkoutImportAccess\(auth\.supabase, userId, 'process'\)/)
  })

  it('a contagem grátis difere por etapa (0 no create, 1 no process)', () => {
    expect(ACCESS).toMatch(/stage === 'create' \? 0 : 1/)
  })

  it('falha de contagem NEGA — nunca libera IA de graça num soluço do banco', () => {
    const catchBlock = ACCESS.slice(ACCESS.indexOf('} catch'))
    expect(catchBlock).toMatch(/return \{ allowed: false/)
  })

  it('as duas rotas têm rate limit', () => {
    expect(CREATE).toMatch(/checkRateLimitAsync/)
    expect(EXTRACT).toMatch(/checkRateLimitAsync/)
  })
})
