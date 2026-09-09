import { describe, it, expect } from 'vitest'
import { buildCheckinRecommendations, sessaoEmDeload } from '../checkinRecommendations'

/** O caso do print de 09/09/2026: RPE 10, satisfação 5, dor 3, sessão em deload. */
const CASO_DO_DONO = {
    preCheckin: { energy: 3, soreness: 1, timeMinutes: 60 },
    postCheckin: { rpe: 10, satisfaction: 5, soreness: 3 },
}

describe('o conselho sabe que a sessão está em DESCARGA', () => {
    it('não manda reduzir a intensidade de quem já reduziu', () => {
        const recs = buildCheckinRecommendations({ ...CASO_DO_DONO, emDeload: true })
        expect(recs.join(' ')).not.toMatch(/reduza um pouco a intensidade/)
    })

    it('mas NÃO emudece: RPE 10 na descarga vira um conselho diferente', () => {
        // Calar seria esconder a sessão que mais pede atenção — a redução de
        // hoje não bastou, e isso é informação nova, não ruído.
        const recs = buildCheckinRecommendations({ ...CASO_DO_DONO, emDeload: true })
        expect(recs.some((r) => /MESMO na descarga/.test(r)), 'o sinal de RPE sumiu').toBe(true)
    })

    it('não sugere deload a quem ESTÁ em deload', () => {
        const recs = buildCheckinRecommendations({
            preCheckin: { soreness: 8 },
            postCheckin: { rpe: 10, satisfaction: 2 },
            emDeload: true,
        })
        expect(recs.join(' '), 'sugeriu deload dentro do deload').not.toMatch(/considere 5–7 dias de deload/)
    })

    it('dor alta na descarga aponta recuperação, não mais corte de carga', () => {
        const recs = buildCheckinRecommendations({
            preCheckin: { soreness: 8 },
            postCheckin: {},
            emDeload: true,
        })
        expect(recs.join(' ')).not.toMatch(/reduzir volume\/carga 20–30%/)
        expect(recs.some((r) => /recuperação/.test(r))).toBe(true)
    })
})

describe('fora da descarga, o conselho de sempre continua igual', () => {
    it('RPE alto volta a mandar reduzir a intensidade', () => {
        const recs = buildCheckinRecommendations({ ...CASO_DO_DONO, emDeload: false })
        expect(recs).toContain('RPE alto: reduza um pouco a intensidade e aumente descanso entre séries.')
    })

    it('fadiga com satisfação morna sugere deload', () => {
        const recs = buildCheckinRecommendations({
            preCheckin: {},
            postCheckin: { rpe: 10, satisfaction: 3 },
            emDeload: false,
        })
        expect(recs.some((r) => /considere 5–7 dias de deload/.test(r))).toBe(true)
    })

    it('as regras que não falam de carga não mudam com a descarga', () => {
        const entrada = { preCheckin: { energy: 1, timeMinutes: 30 }, postCheckin: { satisfaction: 1 } }
        const comum = buildCheckinRecommendations({ ...entrada, emDeload: false })
        const descarga = buildCheckinRecommendations({ ...entrada, emDeload: true })
        expect(descarga).toEqual(comum)
        expect(comum).toHaveLength(3)
    })

    it('check-in vazio não gera conselho nenhum', () => {
        // ⚠️ Regressão real, achada ao extrair a função: `Number('')` é 0, e 0
        // passa nos limiares de energia (≤2) e satisfação (≤2). Quem PULAVA o
        // check-in recebia dois conselhos sobre respostas que não deu.
        expect(buildCheckinRecommendations({})).toEqual([])
        expect(buildCheckinRecommendations({ preCheckin: {}, postCheckin: {} })).toEqual([])
        expect(buildCheckinRecommendations({ preCheckin: { energy: '' }, postCheckin: { satisfaction: '  ' } })).toEqual([])
    })
})

describe('sessaoEmDeload lê os LOGS, que são a prova de que a carga caiu', () => {
    it('acha a marca em qualquer série', () => {
        expect(sessaoEmDeload({ '0-0': { weight: '100' }, '3-2': { deload: { originalWeight: 104 } } })).toBe(true)
    })

    it('sessão sem marca nenhuma não está em deload', () => {
        expect(sessaoEmDeload({ '0-0': { weight: '100' }, '0-1': { weight: '100', done: true } })).toBe(false)
    })

    it('não confunde valor solto com a marca', () => {
        // `deload: false`/string vinda de dado velho não pode ligar o estado.
        expect(sessaoEmDeload({ '0-0': { deload: false } })).toBe(false)
        expect(sessaoEmDeload({ '0-0': { deload: 'sim' } })).toBe(false)
        expect(sessaoEmDeload(null)).toBe(false)
        expect(sessaoEmDeload('nada')).toBe(false)
    })
})
