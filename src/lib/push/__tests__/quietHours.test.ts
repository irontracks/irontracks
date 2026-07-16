import { describe, it, expect } from 'vitest'
import { isInQuietWindow, isUserInQuietHours } from '@/lib/push/quietHours'

describe('isInQuietWindow', () => {
  it('janela normal [9,17)', () => {
    expect(isInQuietWindow(8, 9, 17)).toBe(false)
    expect(isInQuietWindow(9, 9, 17)).toBe(true)
    expect(isInQuietWindow(16, 9, 17)).toBe(true)
    expect(isInQuietWindow(17, 9, 17)).toBe(false) // fim exclusivo
  })

  it('janela que cruza a meia-noite [22,7)', () => {
    expect(isInQuietWindow(23, 22, 7)).toBe(true)
    expect(isInQuietWindow(2, 22, 7)).toBe(true)
    expect(isInQuietWindow(6, 22, 7)).toBe(true)
    expect(isInQuietWindow(7, 22, 7)).toBe(false)
    expect(isInQuietWindow(12, 22, 7)).toBe(false)
  })

  it('start === end nunca silencia', () => {
    expect(isInQuietWindow(5, 8, 8)).toBe(false)
  })
})

describe('isUserInQuietHours', () => {
  it('desligado nunca silencia', () => {
    expect(isUserInQuietHours({ quietHoursEnabled: false, quietHoursStart: 22, quietHoursEnd: 7 }, 2)).toBe(false)
    expect(isUserInQuietHours(null, 2)).toBe(false)
    expect(isUserInQuietHours({}, 2)).toBe(false)
  })

  it('ligado silencia dentro da janela (23h na janela 22→7)', () => {
    const prefs = { quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 7 }
    expect(isUserInQuietHours(prefs, 23)).toBe(true)
    expect(isUserInQuietHours(prefs, 12)).toBe(false)
  })

  it('usa defaults 22→7 se os horários forem inválidos', () => {
    const prefs = { quietHoursEnabled: true, quietHoursStart: 'lixo', quietHoursEnd: null }
    expect(isUserInQuietHours(prefs, 3)).toBe(true)  // dentro de 22→7
    expect(isUserInQuietHours(prefs, 15)).toBe(false)
  })
})
