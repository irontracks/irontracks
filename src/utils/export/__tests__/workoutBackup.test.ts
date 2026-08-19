/**
 * Backup de treinos: o que o arquivo leva e por onde ele sai.
 *
 * Os dois defeitos que motivaram (auditoria de 19/08/2026, reproduzidos no
 * iPhone):
 *   1. "Exportar JSON" não fazia NADA no app nativo — `<a download>` com blob
 *      não baixa no WKWebView, e o botão falhava em silêncio.
 *   2. Mesmo no navegador, o backup guardava só o esqueleto: `sets` era a
 *      contagem e não havia peso, RPE nem `advanced_config` por série, então um
 *      Drop-set restaurava sem as etapas.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildWorkoutBackup,
  buildSingleWorkoutBackup,
  parseWorkoutBackup,
  WORKOUT_BACKUP_VERSION,
} from '../workoutBackupPayload'

const AGORA = '2026-08-19T20:00:00.000Z'

/** Treino com o que mais se perdia: método avançado com etapas e unilateral. */
const treinoReal = {
  id: 'w1',
  title: 'SEG · Upper B - Peito + Braços',
  notes: 'observação do treino',
  archived_at: null,
  exercises: [
    {
      name: 'Pullover no cabo',
      sets: 3,
      reps: '10-12',
      rpe: 8,
      method: 'Drop-Set',
      restTime: 90,
      videoUrl: 'https://x/y',
      notes: 'técnica',
      isUnilateral: false,
      setDetails: [
        { set_number: 1, weight: '50', reps: '10', rpe: 8, set_type: 'warmup' },
        {
          set_number: 2,
          weight: '55',
          reps: '10',
          rpe: 9,
          advanced_config: [{ weight: '55', reps: 10 }, { weight: '45', reps: 8 }],
        },
        { set_number: 3, weight: '55', reps: '8', rpe: 10, set_type: 'working' },
      ],
    },
    {
      name: 'Cadeira flexora unilateral',
      sets: 2,
      reps: '12',
      isUnilateral: true,
      sideRestTime: 30,
      transitionTime: 15,
      setDetails: [{ set_number: 1, weight: '40' }, { set_number: 2, weight: '40' }],
    },
  ],
}

describe('backup v2 — leva a série inteira, não só a contagem', () => {
  const backup = buildWorkoutBackup({ id: 'u1', email: 'a@b.c' }, [treinoReal], AGORA)
  const ex = backup.workouts[0].exercises[0]

  it('carimba versão e data', () => {
    expect(backup.version).toBe(WORKOUT_BACKUP_VERSION)
    expect(backup.exportedAt).toBe(AGORA)
  })

  it('preserva peso, reps e RPE de CADA série', () => {
    expect(ex.setDetails.map((s) => s.weight)).toEqual(['50', '55', '55'])
    expect(ex.setDetails.map((s) => s.reps)).toEqual(['10', '10', '8'])
    expect(ex.setDetails.map((s) => s.rpe)).toEqual([8, 9, 10])
  })

  it('preserva o advanced_config — as etapas do Drop-set', () => {
    expect(ex.setDetails[1].advanced_config).toEqual([
      { weight: '55', reps: 10 },
      { weight: '45', reps: 8 },
    ])
  })

  it('preserva o tipo da série (aquecimento não vira série válida)', () => {
    expect(ex.setDetails[0].set_type).toBe('warmup')
    expect(ex.setDetails[0].is_warmup).toBe(true)
    expect(ex.setDetails[2].set_type).toBe('working')
  })

  it('preserva o bloco unilateral', () => {
    const uni = backup.workouts[0].exercises[1]
    expect(uni.isUnilateral).toBe(true)
    expect(uni.sideRestTime).toBe(30)
    expect(uni.transitionTime).toBe(15)
  })

  it('série sem valor próprio herda o cabeçalho do exercício', () => {
    const uni = backup.workouts[0].exercises[1]
    expect(uni.setDetails.every((s) => s.reps === '12')).toBe(true)
  })

  it('exportar um treino só usa o mesmo formato', () => {
    const um = buildSingleWorkoutBackup({ id: 'u1', email: 'a@b.c' }, treinoReal, AGORA)
    expect(um.workouts).toHaveLength(1)
    expect(um.workouts[0].exercises[0].setDetails).toHaveLength(3)
  })
})

describe('ida e volta — o que sai do backup volta para o save', () => {
  it('o treino restaurado mantém as séries e o método', () => {
    const backup = buildWorkoutBackup(null, [treinoReal], AGORA)
    const { workouts, version } = parseWorkoutBackup(JSON.parse(JSON.stringify(backup)))
    expect(version).toBe(2)
    const ex = (workouts[0].exercises as Record<string, unknown>[])[0]
    expect(ex.method).toBe('Drop-Set')
    const details = ex.setDetails as Record<string, unknown>[]
    expect(details).toHaveLength(3)
    expect(details[1].advanced_config).toBeTruthy()
  })

  it('backup ANTIGO (v1, sem setDetails) continua sendo lido', () => {
    // Quem exportou antes da correção tem só este arquivo — recusá-lo
    // transformaria o conserto em perda de dado.
    const v1 = {
      user: { id: 'u', email: 'a@b.c' },
      workouts: [{ title: 'Treino A', exercises: [{ name: 'Supino', sets: 3, reps: '10' }] }],
    }
    const { workouts, version } = parseWorkoutBackup(v1)
    expect(version).toBe(1)
    expect(workouts).toHaveLength(1)
    const ex = (workouts[0].exercises as Record<string, unknown>[])[0]
    expect(ex.name).toBe('Supino')
    expect(ex.setDetails).toBeUndefined() // o save deriva do cabeçalho, como sempre fez
  })

  it('arquivo sem treinos devolve lista vazia (o chamador avisa)', () => {
    expect(parseWorkoutBackup({}).workouts).toEqual([])
    expect(parseWorkoutBackup(null).workouts).toEqual([])
  })
})

describe('entrega do arquivo — nunca mais um link de download mudo no app', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/utils/export/exportJsonFile.ts'), 'utf8')
  const HOOK = readFileSync(join(process.cwd(), 'src/hooks/useWorkoutExport.ts'), 'utf8')

  it('o caminho nativo vem antes do link de download', () => {
    const share = SRC.indexOf('navigator.share')
    const filesystem = SRC.indexOf('@capacitor/filesystem')
    const download = SRC.indexOf("a.download")
    expect(share).toBeGreaterThan(-1)
    expect(filesystem).toBeGreaterThan(share)
    expect(download).toBeGreaterThan(filesystem)
  })

  it('nunca compartilha uma blob: URL (o bug que fez o PDF sair com a tela do app)', () => {
    expect(SRC).not.toMatch(/navigator\.share\(\s*\{\s*url/)
  })

  it('o hook de export não monta mais o link de download por conta própria', () => {
    expect(HOOK).not.toContain('createObjectURL')
    expect(HOOK).not.toContain('a.download')
    expect(HOOK).toContain('exportJsonFile(')
  })

  it('falha de export avisa o usuário em vez de sumir', () => {
    expect(HOOK).toMatch(/Não consegui gerar o backup/)
  })
})
