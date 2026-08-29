import { describe, it, expect } from 'vitest'
import {
    importarDietaDeJson,
    numeroTolerante,
    diaDaSemana,
    resumoDoImport,
    chaveDaBase,
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

// ─── O que a PRIMEIRA dieta real importada exigiu (29/08/2026) ───────────────
//
// O JSON veio de um assistente externo, no formato que eles realmente
// produzem — e nenhuma das três coisas abaixo funcionava. Antes: 34 itens sem
// macro e ~700 kcal/dia a menos que a meta declarada. Depois: os sete dias
// dentro de 1–5% das metas.

describe('semana como OBJETO, com o dia na chave', () => {
    it('vira lista de dias, com o índice tirado da chave', () => {
        const r = importarDietaDeJson(JSON.stringify({
            nome: 'Dieta Semanal MK',
            semana: {
                segunda: { refeicoes: [{ nome: 'Almoço', alimentos: [{ alimento: 'Arroz cozido', quantidade_g: 200 }] }] },
                domingo: { refeicoes: [{ nome: 'Almoço', alimentos: [{ alimento: 'Arroz cozido', quantidade_g: 180 }] }] },
            },
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.days?.map((d) => d.weekday).sort()).toEqual([0, 1])
        expect(r.payload.meals).toBeUndefined()
    })

    it('o `weekday` de dentro do objeto vence a chave', () => {
        const r = importarDietaDeJson(JSON.stringify({
            semana: { qualquer: { weekday: 4, refeicoes: [{ nome: 'X', alimentos: [{ alimento: 'Aveia', quantidade_g: 50 }] }] } },
        }))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.days![0].weekday).toBe(4)
    })
})

describe('quantidade em g, ml e unidades', () => {
    it('quantidade_g é peso', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Aveia","quantidade_g":50}]}]}')
        expect(r.ok && r.payload.meals![0].items[0].grams).toBe(50)
    })

    it('quantidade_ml conta como grama — nos líquidos desta base 1 ml ≈ 1 g', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Leite desnatado","quantidade_ml":250}]}]}')
        expect(r.ok && r.payload.meals![0].items[0].grams).toBe(250)
    })

    it('quantidade_unidades usa a equivalência da própria base', () => {
        // 'ovo' tem approx.unidade = 50 g. Sem isto, "2 ovos" entrava com 0 g e
        // sem macro nenhum — foi um dos 34 itens vazios da primeira importação.
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Ovos inteiros","quantidade_unidades":2}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0].grams).toBe(100)
        expect(r.payload.meals![0].items[0].protein).toBeGreaterThan(0)
    })
})

describe('macros derivados da base local quando o JSON não os traz', () => {
    it('dieta de nutricionista raramente traz macro por alimento — e mesmo assim entra completa', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"Almoço","items":[{"food":"Arroz branco cozido","quantidade_g":200}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        const item = r.payload.meals![0].items[0]
        // 'arroz cozido': 130 kcal / 28 c por 100 g.
        expect(item.calories).toBe(260)
        expect(item.carbs).toBe(56)
    })

    it('macro DECLARADO nunca é sobrescrito pela base', () => {
        // Um plano que traz kcal e omite proteína está declarando zero de
        // proteína; completar seria inventar sobre o que o nutricionista disse.
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Arroz cozido","grams":200,"calories":999}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0].calories).toBe(999)
        expect(r.payload.meals![0].items[0].protein).toBe(0)
    })

    it('alimento fora da base entra sem macro, não fora do plano', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Torta capixaba da vó","quantidade_g":150}]}]}')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.payload.meals![0].items[0]).toMatchObject({ grams: 150, calories: 0 })
    })
})

describe('chaveDaBase — casamento por TOKENS, não por substring', () => {
    it('acha a entrada mesmo com palavra no MEIO do nome', () => {
        // "arroz BRANCO cozido" quebrava o `includes('arroz cozido')`.
        expect(chaveDaBase('Arroz branco cozido')).toBe('arroz cozido')
    })

    it('prefere a entrada mais específica', () => {
        // 'arroz cozido' (2 tokens) tem que ganhar de 'arroz' isolado.
        expect(chaveDaBase('arroz cozido')).toBe('arroz cozido')
        expect(chaveDaBase('Doce de leite Tirol')).toBe('doce de leite')
    })

    it('resolve plural', () => {
        expect(chaveDaBase('Ovos inteiros')).toBe('ovo')
    })

    it('é indiferente a acento', () => {
        expect(chaveDaBase('Maçã')).toBe('maca')
        expect(chaveDaBase('Feijão preto cozido')).toBe('feijao preto')
    })

    it('nome desconhecido não casa por acaso', () => {
        expect(chaveDaBase('xyzabc')).toBeNull()
        expect(chaveDaBase('')).toBeNull()
    })

    it('NÃO confunde "coxa" de frango com "coxão mole" (carne bovina)', () => {
        // Tokens diferentes: 'coxa' nunca casa com 'coxao mole'.
        expect(chaveDaBase('Coxa ou sobrecoxa sem pele')).toMatch(/^(coxa|sobrecoxa)$/)
    })
})

describe('a TACO complementa a base local (ideia #6)', () => {
    // A base local tem ~200 alimentos curados, com nomes do jeito que o
    // brasileiro escreve e `approx` para unidades. A TACO tem 590 no banco e
    // cobre o que a local não tem. Sem ela, alimento fora da local entrava com
    // macro zerado.
    const taco: Record<string, { kcal: number; p: number; c: number; f: number }> = {
        'quiabo refogado': { kcal: 40, p: 2, c: 7, f: 0.5 },
        'arroz cozido': { kcal: 999, p: 999, c: 999, f: 999 }, // colide de propósito
    }

    it('alimento que a base local NÃO tem passa a entrar completo', () => {
        const semTaco = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Quiabo refogado","grams":100}]}]}')
        expect(semTaco.ok && semTaco.payload.meals![0].items[0].calories).toBe(0)

        const comTaco = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Quiabo refogado","grams":100}]}]}', taco)
        expect(comTaco.ok && comTaco.payload.meals![0].items[0].calories).toBe(40)
    })

    it('a base LOCAL vence em caso de colisão', () => {
        // A local é curada e tem `approx`; a TACO é complemento, não
        // substituta. Invertida a ordem, "arroz cozido" viria com 999 kcal.
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Arroz cozido","grams":100}]}]}', taco)
        expect(r.ok && r.payload.meals![0].items[0].calories).toBe(130)
    })

    it('sem TACO o comportamento é exatamente o anterior', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Arroz cozido","grams":200}]}]}')
        expect(r.ok && r.payload.meals![0].items[0].calories).toBe(260)
    })

    it('unidades continuam saindo só da base local — a TACO não tem `approx`', () => {
        const r = importarDietaDeJson('{"meals":[{"name":"X","items":[{"food":"Ovos inteiros","quantidade_unidades":2}]}]}', taco)
        expect(r.ok && r.payload.meals![0].items[0].grams).toBe(100)
    })
})
