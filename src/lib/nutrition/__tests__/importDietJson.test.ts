import { describe, it, expect } from 'vitest'
import {
    importarDietaDeJson,
    numeroTolerante,
    diaDaSemana,
    resumoDoImport,
    LIMITES,
} from '../importDietJson'

/**
 * O import por JSON é a porta de entrada GRÁTIS da dieta (não gasta IA nossa).
 * Isso o torna entrada não confiável vinda de um modelo que ninguém controla —
 * e é por isso que a tolerância é testada tão a sério quanto a recusa.
 */

describe('numeroTolerante — os modelos escrevem número de todo jeito', () => {
    it('lê o formato limpo', () => {
        expect(numeroTolerante(120)).toBe(120)
        expect(numeroTolerante('120')).toBe(120)
    })

    it('lê com unidade grudada', () => {
        expect(numeroTolerante('120g')).toBe(120)
        expect(numeroTolerante('350 kcal')).toBe(350)
        expect(numeroTolerante('~200kcal')).toBe(200)
    })

    it('decimal em pt-BR', () => {
        expect(numeroTolerante('35,5')).toBe(35.5)
    })

    it('milhar em pt-BR e em inglês dão o MESMO número', () => {
        expect(numeroTolerante('1.200')).toBe(1200)
        expect(numeroTolerante('1,200')).toBe(1200)
        expect(numeroTolerante('1.200,5')).toBe(1200.5)
        expect(numeroTolerante('1,200.5')).toBe(1200.5)
        expect(numeroTolerante('1.234.567')).toBe(1234567)
    })

    it('ponto sozinho: TRÊS casas é milhar, uma ou duas é decimal', () => {
        // A ambiguidade é real ("1.200" muda de significado com o idioma) e a
        // régua é a contagem de casas. Ler "1.200 kcal" como 1,2 apagaria uma
        // refeição; o contrário dá um número que o usuário corrige na prévia.
        expect(numeroTolerante('1.200')).toBe(1200)
        expect(numeroTolerante('1.5')).toBe(1.5)
        expect(numeroTolerante('35.75')).toBe(35.75)
        expect(numeroTolerante('0.5')).toBe(0.5)
    })

    it('o que não dá para ler é zero — macro ausente não derruba a dieta', () => {
        expect(numeroTolerante('a gosto')).toBe(0)
        expect(numeroTolerante(null)).toBe(0)
        expect(numeroTolerante(undefined)).toBe(0)
        expect(numeroTolerante(-5)).toBe(0)
    })
})

describe('diaDaSemana', () => {
    it('aceita nome, abreviação e número — com e sem acento', () => {
        expect(diaDaSemana('domingo')).toBe(0)
        expect(diaDaSemana('Segunda')).toBe(1)
        expect(diaDaSemana('terça')).toBe(2)
        expect(diaDaSemana('terca-feira')).toBe(2)
        expect(diaDaSemana('sáb')).toBe(6)
        expect(diaDaSemana('monday')).toBe(1)
        expect(diaDaSemana(3)).toBe(3)
    })

    it('o que não é dia fica sem dia, em vez de virar domingo', () => {
        expect(diaDaSemana('feriado')).toBeUndefined()
        expect(diaDaSemana(9)).toBeUndefined()
        expect(diaDaSemana('')).toBeUndefined()
    })
})

describe('importarDietaDeJson — recusa com mensagem que ensina', () => {
    it('texto vazio', () => {
        const r = importarDietaDeJson('   ')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.erro).toMatch(/Cole o JSON/)
    })

    it('JSON inválido diz o erro mais comum: o texto em volta', () => {
        const r = importarDietaDeJson('```json\n{"meals":[]}\n```')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.erro).toMatch(/SÓ o JSON/)
    })

    it('JSON válido mas sem refeição não passa como plano vazio', () => {
        const r = importarDietaDeJson('{"meals":[]}')
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.erro).toMatch(/refeições com alimentos/)
    })

    it('refeição sem nenhum alimento não vira refeição', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"Café","items":[]}]}')
        expect(r.ok).toBe(false)
    })
})

describe('importarDietaDeJson — o formato canônico', () => {
    const canonico = JSON.stringify({
        planName: 'Dieta da nutri',
        meals: [{
            name: 'Café da manhã', time: '07:00',
            items: [{ food: 'Ovo mexido', grams: 120, calories: 180, protein: 13, carbs: 1, fat: 13 }],
        }],
    })

    it('entra inteiro', () => {
        const r = importarDietaDeJson(canonico)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.planName).toBe('Dieta da nutri')
        expect(r.payload.meals?.[0]).toMatchObject({ name: 'Café da manhã', time: '07:00' })
        expect(r.payload.meals?.[0].items[0]).toMatchObject({ food: 'Ovo mexido', grams: 120, protein: 13 })
    })

    it('plano de dia e de semana são exclusivos — a rota recusa os dois juntos', () => {
        const r = importarDietaDeJson(canonico)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(Boolean(r.payload.meals) !== Boolean(r.payload.days)).toBe(true)
    })
})

describe('importarDietaDeJson — tolerância é o produto', () => {
    it('aceita as chaves em português, que é como os modelos respondem', () => {
        const r = importarDietaDeJson(JSON.stringify({
            nome: 'Plano do nutri',
            refeicoes: [{
                nome: 'Almoço', horario: '12:30',
                alimentos: [{ alimento: 'Arroz branco', gramas: '150g', calorias: '193 kcal', proteina: '3,5', carboidratos: 42, gordura: 0.4 }],
            }],
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.planName).toBe('Plano do nutri')
        const item = r.payload.meals![0].items[0]
        expect(item).toMatchObject({ food: 'Arroz branco', grams: 150, calories: 193, protein: 3.5, carbs: 42 })
    })

    it('aceita ACENTO e CAIXA diferentes nas chaves', () => {
        const r = importarDietaDeJson('{"Refeições":[{"Nome":"Jantar","Alimentos":[{"Alimento":"Frango","Proteína":30}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0]).toMatchObject({ food: 'Frango', protein: 30 })
    })

    it('aceita o array de refeições SOLTO, sem objeto em volta', () => {
        const r = importarDietaDeJson('[{"name":"Ceia","items":[{"food":"Iogurte","calories":100}]}]')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals).toHaveLength(1)
    })

    it('item que é só uma string entra com macros zerados', () => {
        // Melhor a dieta entrar incompleta do que não entrar: o usuário
        // completa na tela, que é onde ele já sabe editar.
        const r = importarDietaDeJson('{"meals":[{"name":"Café","items":["2 fatias de pão integral"]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0]).toMatchObject({ food: '2 fatias de pão integral', calories: 0 })
    })

    it('item SEM nome de alimento é descartado — não vira linha fantasma', () => {
        // Um objeto com macros e sem `food` não é comida: entraria como item em
        // branco na dieta, ocupando espaço e sem dizer o que a pessoa come.
        // (Provado por mutação: sem este caso, remover a checagem passava verde.)
        const r = importarDietaDeJson('{"meals":[{"name":"Café","items":[{"calories":200,"protein":10},{"food":"Ovo","calories":80}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items).toHaveLength(1)
        expect(r.payload.meals![0].items[0].food).toBe('Ovo')
    })

    it('refeição em que NENHUM item tem nome não entra', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"Café","items":[{"calories":200},{"protein":10}]}]}')
        expect(r.ok).toBe(false)
    })

    it('string vazia como item também é descartada', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"Café","items":["   ","Pão"]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items).toHaveLength(1)
    })

    it('refeição sem nome ganha um, em vez de ser descartada', () => {
        const r = importarDietaDeJson('{"meals":[{"items":[{"food":"Whey"}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].name).toBe('Refeição')
    })
})

describe('importarDietaDeJson — plano de semana', () => {
    it('lê os dias e converte o nome do dia em índice', () => {
        const r = importarDietaDeJson(JSON.stringify({
            dias: [
                { dia: 'segunda', refeicoes: [{ nome: 'Café', alimentos: [{ alimento: 'Aveia', calorias: 150 }] }] },
                { dia: 'terça', refeicoes: [{ nome: 'Café', alimentos: [{ alimento: 'Tapioca', calorias: 200 }] }] },
            ],
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.days).toHaveLength(2)
        expect(r.payload.days![0].weekday).toBe(1)
        expect(r.payload.days![1].weekday).toBe(2)
        expect(r.payload.meals).toBeUndefined()
    })

    it('dia sem refeição some, mas não derruba os outros', () => {
        const r = importarDietaDeJson(JSON.stringify({
            days: [
                { weekday: 1, meals: [] },
                { weekday: 2, meals: [{ name: 'Café', items: [{ food: 'Ovo' }] }] },
            ],
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.days).toHaveLength(1)
        expect(r.payload.days![0].weekday).toBe(2)
    })
})

describe('os tetos do BodySchema são respeitados AQUI', () => {
    // Estourar o teto faz a rota devolver 400 com "Invalid input" — mensagem
    // que não ensina nada a quem colou o JSON. Melhor cortar e avisar.
    it('corta refeições demais e avisa', () => {
        const meals = Array.from({ length: 14 }, (_, i) => ({ name: `R${i}`, items: [{ food: 'X', calories: 10 }] }))
        const r = importarDietaDeJson(JSON.stringify({ meals }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals).toHaveLength(LIMITES.refeicoesPorDia)
        expect(r.avisos.join(' ')).toMatch(/refeições/)
    })

    it('corta itens demais e avisa', () => {
        const items = Array.from({ length: 30 }, (_, i) => ({ food: `A${i}`, calories: 10 }))
        const r = importarDietaDeJson(JSON.stringify({ meals: [{ name: 'Almoço', items }] }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items).toHaveLength(LIMITES.itensPorRefeicao)
        expect(r.avisos.join(' ')).toMatch(/alimentos/)
    })

    it('corta dias além de 7', () => {
        const days = Array.from({ length: 10 }, () => ({ meals: [{ name: 'C', items: [{ food: 'X' }] }] }))
        const r = importarDietaDeJson(JSON.stringify({ days }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.days).toHaveLength(LIMITES.diasPorSemana)
    })

    it('número absurdo é limitado ao teto, não recusado', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Y","grams":999999,"protein":9999}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0].grams).toBe(LIMITES.gramas)
        expect(r.payload.meals![0].items[0].protein).toBe(LIMITES.proteinaItem)
    })

    it('nome gigante é truncado — a coluna é jsonb, não depósito', () => {
        const r = importarDietaDeJson(JSON.stringify({ meals: [{ name: 'N'.repeat(200), items: [{ food: 'F'.repeat(400) }] }] }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].name.length).toBe(LIMITES.nomeDaRefeicao)
        expect(r.payload.meals![0].items[0].food.length).toBe(LIMITES.nomeDoAlimento)
    })
})

describe('resumoDoImport — o usuário confere ANTES de substituir o plano atual', () => {
    it('conta dias, refeições, alimentos e a kcal do dia', () => {
        const r = importarDietaDeJson(JSON.stringify({
            meals: [
                { name: 'Café', items: [{ food: 'Ovo', calories: 180 }, { food: 'Pão', calories: 140 }] },
                { name: 'Almoço', items: [{ food: 'Arroz', calories: 200 }] },
            ],
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(resumoDoImport(r.payload)).toEqual({ dias: 1, refeicoes: 2, alimentos: 3, kcal: 520 })
    })

    it('no plano da semana a kcal é a MÉDIA por dia, não a soma dos sete', () => {
        const r = importarDietaDeJson(JSON.stringify({
            days: [
                { weekday: 1, meals: [{ name: 'C', items: [{ food: 'A', calories: 1000 }] }] },
                { weekday: 2, meals: [{ name: 'C', items: [{ food: 'B', calories: 2000 }] }] },
            ],
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(resumoDoImport(r.payload).kcal).toBe(1500)
    })
})
