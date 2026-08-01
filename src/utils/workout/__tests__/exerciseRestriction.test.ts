import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isExerciseRestricted } from '@/utils/workout/movementPatterns'

/**
 * O caso real que originou o filtro (ago/2026): o card "Ajustar treino"
 * sugeriu Stiff para quem tinha escrito, no próprio perfil,
 * "Treino: Upper/Lower 5 dias, SEM hip thrust/coice (lombar)".
 *
 * A sugestão estava certa PARA O PADRÃO (faltava extensão de quadril) e errada
 * PARA A PESSOA. O catálogo sabe de movimento, não de dor.
 */
const REAL_CONSTRAINT = 'Treino: Upper/Lower 5 dias, SEM hip thrust/coice (lombar)'

describe('isExerciseRestricted', () => {
    it('remove o que a restrição NOMEIA, mesmo com pontuação no meio', () => {
        // "hip thrust/coice" — a barra não pode impedir o casamento.
        expect(isExerciseRestricted('Hip Thrust', REAL_CONSTRAINT)).toBe(true)
        expect(isExerciseRestricted('Elevação pélvica com barra', 'sem elevacao pelvica')).toBe(true)
        expect(isExerciseRestricted('Coice no cabo', REAL_CONSTRAINT)).toBe(true)
    })

    it('ignora acento e caixa — o texto é escrito à mão pelo aluno', () => {
        expect(isExerciseRestricted('AGACHAMENTO LIVRE', 'nao posso fazer agachamento')).toBe(true)
        expect(isExerciseRestricted('Agachamento livre', 'não posso fazer AGACHAMENTO')).toBe(true)
    })

    it('não inventa relação clínica: o que a restrição não nomeia, passa', () => {
        // Stiff carrega a lombar, e ainda assim NÃO é filtrado — inferir que um
        // exercício compartilha a estrutura de outro é julgamento clínico, e
        // chutar isso silenciosamente é pior que não filtrar. O card exibe a
        // restrição ao lado das sugestões justamente por causa deste caso.
        expect(isExerciseRestricted('Stiff', REAL_CONSTRAINT)).toBe(false)
        expect(isExerciseRestricted('Mesa flexora', REAL_CONSTRAINT)).toBe(false)
    })

    it('não casa por palavra curta ou genérica', () => {
        // "de", "com", "no" apareceriam em quase toda restrição.
        expect(isExerciseRestricted('Remada com halteres', 'dor no ombro com carga alta')).toBe(false)
        expect(isExerciseRestricted('Leg press', 'sem impacto no joelho')).toBe(false)
    })

    it('perfil sem restrição não filtra nada', () => {
        expect(isExerciseRestricted('Hip Thrust', null)).toBe(false)
        expect(isExerciseRestricted('Hip Thrust', '')).toBe(false)
        expect(isExerciseRestricted('', REAL_CONSTRAINT)).toBe(false)
    })

    it('aceita restrição salva como objeto (o campo é jsonb)', () => {
        expect(isExerciseRestricted('Hip Thrust', JSON.stringify({ nota: 'sem hip thrust' }))).toBe(true)
    })
})

describe('rota muscle-gap: restrição do aluno', () => {
    const src = readFileSync('src/app/api/workout/muscle-gap/route.ts', 'utf8')

    it('lê as restrições declaradas antes de montar as sugestões', () => {
        expect(src).toMatch(/from\('vip_profile'\)[\s\S]{0,80}constraints/)
    })

    it('filtra a sugestão que a restrição nomeia', () => {
        // Casa a CHAMADA, não o import: trocar a condição por `false` deixaria o
        // identificador na linha de import e o guard passaria com o bug de volta.
        expect(src).toMatch(/isExerciseRestricted\(String\(l\.display_name_pt\), constraintsText\)/)
        expect(src).toMatch(/excludedByRestriction\.push/)
    })

    it('devolve o texto da restrição pro card — o que a regra não decide, a pessoa decide', () => {
        expect(src).toMatch(/restriction:/)
        expect(src).toMatch(/excluded:/)
    })
})

describe('exercício adicionado vem com descrição', () => {
    const route = readFileSync('src/app/api/workouts/exercises/route.ts', 'utf8')
    const note = readFileSync('src/utils/workout/exerciseNote.ts', 'utf8')

    it('a rota gera a nota e grava em `notes`', () => {
        // Sem isto o exercício entra MUDO no meio de outros explicados — foi
        // exatamente o que o dono viu no Stiff adicionado pela avaliação.
        expect(route).toContain('generateExerciseNote')
        expect(route).toMatch(/notes: note/)
    })

    it('a nota usa o contexto REAL do aluno, com as restrições dentro', () => {
        // 'profile' é a seção que carrega `vip_profile.constraints` (as dores).
        expect(note).toMatch(/buildUserContextBlock\([^)]*\['profile'/)
    })

    it('falhar na descrição NÃO impede a adição', () => {
        // Adicionar o exercício é o que o usuário pediu; a descrição é bônus.
        expect(note).toMatch(/return null/)
        expect(note).toContain('logWarnRemote')
        expect(route).not.toMatch(/generateExerciseNote[\s\S]{0,200}throw/)
    })
})
