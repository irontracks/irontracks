import { describe, it, expect } from 'vitest'
import { calculateBMI, bmiForStorage, BMI_MAX, classifyBMI, calculateBodyFatPercentage, calculateBodyDensity, combinedBodyFat } from '../bodyComposition'

describe('Body Composition Calculations', () => {
  describe('calculateBMI', () => {
    it('should calculate BMI correctly', () => {
      // 80kg / 1.80m^2 = 80 / 3.24 = 24.69
      const bmi = calculateBMI(80, 180)
      expect(bmi).toBeCloseTo(24.69, 2)
    })

    it('should throw error for invalid input', () => {
      expect(() => calculateBMI(0, 180)).toThrow('Peso e altura devem ser maiores que zero')
      expect(() => calculateBMI(80, 0)).toThrow('Peso e altura devem ser maiores que zero')
    })

    it('limita o ABSURDO, não o caso extremo real', () => {
      // O teto era 60 até 28/08/2026 — e 60 apaga gente que existe: obesidade
      // grau III passa disso. 200 kg / 1,70 m = 69,2 é uma pessoa, não um erro
      // de digitação, e agora é gravado como tal.
      expect(calculateBMI(200, 170)).toBeCloseTo(69.2, 1)

      // 200 kg / 1,50 m = 88,9 já é fora da faixa registrada: fica no teto.
      expect(calculateBMI(200, 150)).toBe(BMI_MAX)

      // Altura em METROS no campo de centímetros — o erro clássico, IMC 261.
      expect(calculateBMI(80, 1.75)).toBe(BMI_MAX)

      // 30kg / 2m^2 = 7.5 -> should be capped at 10
      expect(calculateBMI(30, 200)).toBe(10)
    })
  })

  describe('classifyBMI', () => {
    it('should classify BMI ranges correctly', () => {
      expect(classifyBMI(18.4)).toBe('Abaixo do peso')
      expect(classifyBMI(24.9)).toBe('Peso normal')
      expect(classifyBMI(29.9)).toBe('Sobrepeso')
      expect(classifyBMI(34.9)).toBe('Obesidade grau I')
      expect(classifyBMI(39.9)).toBe('Obesidade grau II')
      expect(classifyBMI(40.1)).toBe('Obesidade grau III')
    })
  })

  describe('calculateBodyDensity', () => {
    it('should calculate density for male', () => {
      // sum7Skinfolds = 100, age = 30, gender = 'M'
      // 1.112 - (0.00043499 * 100) + (0.00000055 * 100^2) - (0.00028826 * 30)
      // 1.112 - 0.043499 + 0.0055 - 0.0086478
      // 1.0653532
      const density = calculateBodyDensity(100, 30, 'M')
      expect(density).toBeCloseTo(1.0653532, 5)
    })

    it('should calculate density for female', () => {
      // sum7Skinfolds = 100, age = 30, gender = 'F'
      // 1.097 - (0.00046971 * 100) + (0.00000056 * 100^2) - (0.00012828 * 30)
      // 1.097 - 0.046971 + 0.0056 - 0.0038484
      // 1.0517806
      const density = calculateBodyDensity(100, 30, 'F')
      expect(density).toBeCloseTo(1.0517806, 5)
    })
  })

  describe('calculateBodyFatPercentage', () => {
    it('should calculate body fat from density', () => {
      // Siri: (495 / density) - 450
      // density = 1.05
      // 495 / 1.05 = 471.42857...
      // 471.42857 - 450 = 21.42857
      const fat = calculateBodyFatPercentage(1.05)
      expect(fat).toBeCloseTo(21.429, 3)
    })
  })

  describe('combinedBodyFat — trava fisiológica do blend (3–75%)', () => {
    it('média simples quando ambos plausíveis', () => {
      expect(combinedBodyFat(20, 18)).toBe(19)
    })
    it('BIA absurdo (90%, erro de vírgula) é descartado — usa só as dobras', () => {
      expect(combinedBodyFat(20, 90)).toBe(20)
    })
    it('obesidade extrema real (BIA 62%) ENTRA na média — não é perda de dado', () => {
      expect(combinedBodyFat(20, 62)).toBe(41)
      expect(combinedBodyFat(null, 62)).toBe(62)
    })
    it('acima de 75% (erro claro) é descartado', () => {
      expect(combinedBodyFat(30, 76)).toBe(30)
      expect(combinedBodyFat(null, 80)).toBeNull()
    })
    it('BIA zerado por engano não puxa a média pela metade', () => {
      expect(combinedBodyFat(25, 0)).toBe(25)
    })
    it('só BIA plausível → usa BIA', () => {
      expect(combinedBodyFat(null, 22)).toBe(22)
    })
    it('nenhum plausível → null', () => {
      expect(combinedBodyFat(null, 200)).toBeNull()
      expect(combinedBodyFat(1, 90)).toBeNull()
    })
  })
})

/**
 * O IMC GRAVADO tem que ser o mesmo que a tela mostra.
 *
 * `useAssessment` calculava duas vezes: `calculateBMI` para exibir (com clamp) e
 * uma conta à mão para persistir (sem clamp). Altura digitada em metros —
 * "1,75" no campo de centímetros — gravava IMC 261 no banco enquanto a tela
 * exibia 60. Dois números para o mesmo corpo, e o errado era o que ficava.
 */
describe('bmiForStorage', () => {
  it('grava o MESMO número que a tela exibe', () => {
    const peso = 80, altura = 180
    expect(bmiForStorage(peso, altura)).toBe(Number(calculateBMI(peso, altura).toFixed(1)))
  })

  it('barra o erro de digitação clássico: altura em METROS no campo de centímetros', () => {
    // 80 kg com "1.75" lido como 1,75 cm daria IMC 261.224.
    const absurdo = bmiForStorage(80, 1.75)
    expect(absurdo).toBe(BMI_MAX)
  })

  it('NÃO mente sobre caso real — obesidade grau III passa de 60 e é gravada', () => {
    // 200 kg / 1,70 m = 69,2. O teto antigo (60) apagaria isso.
    expect(bmiForStorage(200, 170)).toBeCloseTo(69.2, 1)
  })

  it('sem peso ou sem altura devolve undefined — não persistimos lixo', () => {
    expect(bmiForStorage(0, 180)).toBeUndefined()
    expect(bmiForStorage(80, 0)).toBeUndefined()
    expect(bmiForStorage(Number.NaN, 180)).toBeUndefined()
  })

  it('uma casa decimal, como o banco recebia antes', () => {
    const v = bmiForStorage(80.4, 177) as number
    expect(String(v)).toMatch(/^\d+(\.\d)?$/)
  })
})

describe('fiação: o caminho que persiste usa a fonte única', () => {
  it('useAssessment não recalcula IMC à mão', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/hooks/useAssessment.ts'), 'utf8')
    const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(semComentarios, 'IMC calculado à mão de novo — use bmiForStorage')
      .not.toMatch(/Math\.pow\(\s*height\s*\/\s*100/)
    expect(semComentarios).toMatch(/bmiForStorage\(/)
  })
})
