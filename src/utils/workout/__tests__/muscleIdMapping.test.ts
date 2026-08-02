import { describe, it, expect } from 'vitest'
import { muscleIdFromLabel, muscleIdFromLibrary, ID_TO_LIBRARY_MUSCLES } from '@/utils/workout/muscleIdMapping'

/**
 * O rótulo do grupo vem da IA em texto livre (`links[].muscleGroup`) e precisa
 * virar um MuscleId para consultar o catálogo. Errar aqui manda o usuário pro
 * card do músculo errado — e o caso mais perigoso é "Posterior", que na
 * correlação significa posterior de COXA, não deltoide posterior.
 */
describe('muscleIdFromLabel — rótulo livre da IA → MuscleId', () => {
    it('"Posterior" sozinho é posterior de coxa (convenção do app)', () => {
        expect(muscleIdFromLabel('Posterior')).toBe('hamstrings')
        expect(muscleIdFromLabel('Posterior de coxa')).toBe('hamstrings')
        expect(muscleIdFromLabel('Isquiotibiais')).toBe('hamstrings')
    })

    it('mas "deltoide posterior" continua sendo ombro', () => {
        expect(muscleIdFromLabel('Deltoide posterior')).toBe('delts_rear')
        expect(muscleIdFromLabel('Ombro posterior')).toBe('delts_rear')
    })

    it('reconhece os grupos que a correlação costuma citar', () => {
        expect(muscleIdFromLabel('Panturrilhas')).toBe('calves')
        expect(muscleIdFromLabel('Quadríceps')).toBe('quads')
        expect(muscleIdFromLabel('Glúteos')).toBe('glutes')
        expect(muscleIdFromLabel('Abdômen')).toBe('abs')
        expect(muscleIdFromLabel('Peitoral')).toBe('chest')
        expect(muscleIdFromLabel('Costas')).toBe('lats')
    })

    it('não se perde com acento, caixa ou espaço extra', () => {
        expect(muscleIdFromLabel('  PANTURRILHAS  ')).toBe('calves')
        expect(muscleIdFromLabel('quadriceps')).toBe('quads')
        expect(muscleIdFromLabel('Abdomen')).toBe('abs')
    })

    it('devolve null pro que não reconhece — melhor não abrir card que abrir o errado', () => {
        expect(muscleIdFromLabel('Cadeia posterior completa e core')).not.toBe(null) // casa "posterior"
        expect(muscleIdFromLabel('')).toBeNull()
        expect(muscleIdFromLabel('xpto')).toBeNull()
        expect(muscleIdFromLabel(null)).toBeNull()
    })
})

describe('vocabulário do catálogo ↔ MUSCLE_GROUPS', () => {
    it('traduz primary_muscle da exercise_library', () => {
        expect(muscleIdFromLibrary('posterior_de_coxa')).toBe('hamstrings')
        expect(muscleIdFromLibrary('panturrilhas')).toBe('calves')
        expect(muscleIdFromLibrary('abdomen')).toBe('abs')
        expect(muscleIdFromLibrary('inexistente')).toBeNull()
    })

    it('o caminho de volta cobre os grupos com padrões curados', () => {
        for (const id of ['hamstrings', 'calves', 'abs', 'quads', 'glutes'] as const) {
            expect(ID_TO_LIBRARY_MUSCLES[id]?.length).toBeGreaterThan(0)
        }
        expect(ID_TO_LIBRARY_MUSCLES.abs).toContain('abdomen')
        expect(ID_TO_LIBRARY_MUSCLES.abs).toContain('core')
    })
})
