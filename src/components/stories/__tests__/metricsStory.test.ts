/**
 * Guards do layout de MÉTRICAS do Story.
 *
 * ⚠️ Limite declarado: jsdom não implementa `canvas.getContext('2d')`, então
 * `drawMetricsStory` NÃO é exercitado aqui — `measureText` cairia em fallback e
 * o teste passaria verde com o desenho quebrado (foi assim que a legenda do
 * Story subiu invisível com 23 guards verdes). O que se prova aqui é a
 * MONTAGEM do conteúdo; o resultado na tela se confere no aparelho.
 */
import { describe, it, expect } from 'vitest'
import {
    metricsToContent,
    formatMetricValue,
    periodLabel,
    MAX_METRIC_CARDS,
    MAX_METRIC_ROWS,
    type MetricsStoryItem,
} from '../metricsStory'

const M = (key: string, value: number, sub?: string): MetricsStoryItem => ({
    key,
    label: key.toUpperCase(),
    value,
    sub,
})

const NOVE = [
    M('activeUsers', 18), M('signups', 2), M('sessionsLogged', 111),
    M('wizardOpened', 7), M('workoutsCreated', 0), M('trialsGranted', 0),
    M('paywallShown', 0), M('paywallCta', 0), M('payingActive', 1),
]

describe('formatMetricValue', () => {
    it('usa separador de milhar pt-BR', () => {
        expect(formatMetricValue(2427394)).toBe('2.427.394')
    })
    it('arredonda e aguenta lixo', () => {
        expect(formatMetricValue(12.6)).toBe('13')
        expect(formatMetricValue(Number.NaN)).toBe('0')
    })
})

describe('periodLabel', () => {
    it('nomeia as janelas usuais', () => {
        expect(periodLabel(1)).toBe('ÚLTIMAS 24 HORAS')
        expect(periodLabel(7)).toBe('ÚLTIMOS 7 DIAS')
        expect(periodLabel(14)).toBe('ÚLTIMOS 14 DIAS')
    })
})

describe('metricsToContent', () => {
    it('o HERÓI não reaparece embaixo — um fato, um lugar', () => {
        const c = metricsToContent(NOVE, { heroKey: 'sessionsLogged', periodDays: 14 })
        expect(c.hero.value).toBe('111')
        const apoio = [...c.cards, ...c.rows].map((x) => x.label)
        expect(apoio).not.toContain('SESSIONSLOGGED')
    })

    it('sem heroKey, destaca a primeira métrica', () => {
        const c = metricsToContent(NOVE, { heroKey: null, periodDays: 14 })
        expect(c.hero.label).toBe('ACTIVEUSERS')
        expect([...c.cards, ...c.rows].map((x) => x.label)).not.toContain('ACTIVEUSERS')
    })

    it('heroKey inexistente cai na primeira, sem sumir com métrica', () => {
        const c = metricsToContent(NOVE, { heroKey: 'nao-existe', periodDays: 14 })
        expect(c.hero.label).toBe('ACTIVEUSERS')
        expect(c.cards.length + c.rows.length).toBe(Math.min(NOVE.length - 1, MAX_METRIC_CARDS + MAX_METRIC_ROWS))
    })

    it('respeita os tetos de cards e linhas', () => {
        const c = metricsToContent(NOVE, { heroKey: 'activeUsers', periodDays: 14 })
        expect(c.cards.length).toBeLessThanOrEqual(MAX_METRIC_CARDS)
        expect(c.rows.length).toBeLessThanOrEqual(MAX_METRIC_ROWS)
    })

    it('nunca repete um rótulo entre herói, cards e linhas', () => {
        const c = metricsToContent(NOVE, { heroKey: 'payingActive', periodDays: 14 })
        const todos = [c.hero.label, ...c.cards.map((x) => x.label), ...c.rows.map((x) => x.label)]
        expect(new Set(todos).size).toBe(todos.length)
    })

    it('lista vazia não quebra o story', () => {
        const c = metricsToContent([], { heroKey: null, periodDays: 7 })
        expect(c.hero.value).toBe('—')
        expect(c.cards).toEqual([])
        expect(c.rows).toEqual([])
        expect(c.periodText).toBe('ÚLTIMOS 7 DIAS')
    })

    it('uma métrica só: vira herói e não sobra apoio', () => {
        const c = metricsToContent([M('signups', 2)], { heroKey: null, periodDays: 14 })
        expect(c.hero.value).toBe('2')
        expect(c.cards).toEqual([])
        expect(c.rows).toEqual([])
    })

    it('carrega o sub do herói (a taxa) para a tela', () => {
        const c = metricsToContent([M('workoutsCreated', 0, '0% de 7'), M('signups', 2)], { heroKey: 'workoutsCreated', periodDays: 14 })
        expect(c.hero.sub).toBe('0% de 7')
    })

    it('título default quando não informado', () => {
        expect(metricsToContent(NOVE, { heroKey: null, periodDays: 14 }).title).toBe('MÉTRICAS')
        expect(metricsToContent(NOVE, { heroKey: null, periodDays: 14, title: 'IRONTRACKS EM NÚMEROS' }).title).toBe('IRONTRACKS EM NÚMEROS')
    })
})
