import { describe, it, expect } from 'vitest'
import { checkinEnergyLabel, checkinPlainValue, checkinSleepLabel, checkinWeightLabel } from '../checkinFields'

describe('checkinEnergyLabel', () => {
    it('traduz a escala 1–5 pro mesmo emoji do seletor de humor', () => {
        expect(checkinEnergyLabel(5)).toBe('💪 Ótimo')
        expect(checkinEnergyLabel(2)).toBe('😴 Cansado')
        expect(checkinEnergyLabel(3)).toBe('😐 Normal')
        expect(checkinEnergyLabel(1)).toBe('😴 Cansado')
    })

    it('ausente é travessão, não zero', () => {
        expect(checkinEnergyLabel(null)).toBe('—')
        expect(checkinEnergyLabel(undefined)).toBe('—')
        expect(checkinEnergyLabel('')).toBe('—')
    })
})

describe('checkinWeightLabel / checkinSleepLabel', () => {
    it('formata em pt-BR com vírgula, aceitando vírgula na entrada', () => {
        expect(checkinWeightLabel('82,5')).toBe('82,5 kg')
        expect(checkinWeightLabel(82.5)).toBe('82,5 kg')
        expect(checkinSleepLabel('7,5')).toBe('7,5 h')
    })

    it('arredonda pra 1 casa — sem lixo de float', () => {
        expect(checkinWeightLabel(82.53219)).toBe('82,5 kg')
    })

    it('ausente é travessão', () => {
        expect(checkinWeightLabel(null)).toBe('—')
        expect(checkinSleepLabel(undefined)).toBe('—')
        expect(checkinWeightLabel('')).toBe('—')
    })

    it('lixo não numérico não vira 0', () => {
        expect(checkinWeightLabel('abc')).toBe('—')
    })
})

describe('checkinPlainValue', () => {
    it('sem sufixo por padrão — a escala nunca foi rotulada na tela', () => {
        expect(checkinPlainValue(7)).toBe('7')
        expect(checkinPlainValue('7')).toBe('7')
    })

    it('aceita sufixo (tempo disponível em minutos)', () => {
        expect(checkinPlainValue(45, ' min')).toBe('45 min')
    })

    it('ausente ou vazio é travessão', () => {
        expect(checkinPlainValue(null)).toBe('—')
        expect(checkinPlainValue(undefined)).toBe('—')
        expect(checkinPlainValue('')).toBe('—')
        expect(checkinPlainValue('   ')).toBe('—')
    })

    it('zero É um valor — dor 0/10 não pode virar travessão', () => {
        expect(checkinPlainValue(0)).toBe('0')
    })
})
