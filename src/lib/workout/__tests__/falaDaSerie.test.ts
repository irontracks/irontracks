import { describe, it, expect } from 'vitest'
import { falaDaSerie, numerosExtensoParaDigitos } from '../falaDaSerie'

/**
 * Guard do parser de voz — ver o aviso no topo de `falaDaSerie.ts`: sem
 * calibração com transcript real (Fase 0 pulada a pedido do dono), estas são
 * as frases que o PEDIDO original e o senso comum previam, não amostra
 * medida. Ajustar aqui assim que a telemetria trouxer casos reais.
 */

describe('numerosExtensoParaDigitos', () => {
  it('unidades simples', () => {
    expect(numerosExtensoParaDigitos('oito')).toBe('8')
    expect(numerosExtensoParaDigitos('doze')).toBe('12')
  })

  it('dezena + unidade', () => {
    expect(numerosExtensoParaDigitos('oitenta e dois')).toBe('82')
    expect(numerosExtensoParaDigitos('vinte e cinco')).toBe('25')
  })

  it('centena sozinha e "cento e X"', () => {
    expect(numerosExtensoParaDigitos('cem')).toBe('100')
    expect(numerosExtensoParaDigitos('cento e vinte')).toBe('120')
    expect(numerosExtensoParaDigitos('cento e oito')).toBe('108')
    expect(numerosExtensoParaDigitos('duzentos e vinte e cinco')).toBe('225')
  })

  it('"e meio"/"e meia" vira decimal de 0,5', () => {
    expect(numerosExtensoParaDigitos('oitenta e dois e meio')).toBe('82,5')
    expect(numerosExtensoParaDigitos('sete e meia')).toBe('7,5')
  })

  it('preserva o texto ao redor', () => {
    expect(numerosExtensoParaDigitos('cem quilos doze repetições')).toBe('100 quilos 12 repeticoes')
  })

  it('dígito já numérico passa intacto', () => {
    expect(numerosExtensoParaDigitos('100kg 12 reps')).toBe('100kg 12 reps')
  })
})

describe('falaDaSerie — o exemplo do pedido original', () => {
  it('"100kg 12 repetições" → peso e reps', () => {
    const r = falaDaSerie('100kg 12 repetições')
    expect(r.pesoKg).toBe(100)
    expect(r.reps).toBe(12)
    expect(r.rpe).toBeUndefined()
    expect(r.entendeu).toBe(true)
  })

  it('"12 reps rpe 8" → reps e rpe, sem peso', () => {
    const r = falaDaSerie('12 reps rpe 8')
    expect(r.reps).toBe(12)
    expect(r.rpe).toBe(8)
    expect(r.pesoKg).toBeUndefined()
  })

  it('os três juntos, com traço como no pedido', () => {
    const r = falaDaSerie('100kg - 12 repetições - rpe 8')
    expect(r).toMatchObject({ pesoKg: 100, reps: 12, rpe: 8 })
  })
})

describe('falaDaSerie — número por extenso', () => {
  it('peso e reps totalmente por extenso', () => {
    const r = falaDaSerie('cem quilos doze repetições')
    expect(r).toMatchObject({ pesoKg: 100, reps: 12 })
  })

  it('peso com meio quilo', () => {
    const r = falaDaSerie('oitenta e dois e meio quilos')
    expect(r.pesoKg).toBe(82.5)
  })

  it('rpe falado como "erre pê ê"', () => {
    const r = falaDaSerie('erre pê ê oito')
    expect(r.rpe).toBe(8)
  })

  it('rpe com meio ponto', () => {
    const r = falaDaSerie('rpe sete e meio')
    expect(r.rpe).toBe(7.5)
  })
})

describe('falaDaSerie — variações de unidade e sigla', () => {
  it('"quilo" no singular', () => {
    expect(falaDaSerie('80 quilo').pesoKg).toBe(80)
  })

  it('"repetição" no singular', () => {
    expect(falaDaSerie('1 repetição').reps).toBe(1)
  })

  it('vírgula decimal no peso', () => {
    expect(falaDaSerie('82,5 kg').pesoKg).toBe(82.5)
  })

  it('"r p e" com espaços entre as letras', () => {
    expect(falaDaSerie('r p e 9').rpe).toBe(9)
  })
})

describe('falaDaSerie — série explícita', () => {
  it('"série 2: 100kg 12 reps" extrai o índice', () => {
    const r = falaDaSerie('série 2 100kg 12 reps')
    expect(r.serie).toBe(2)
    expect(r.pesoKg).toBe(100)
    expect(r.reps).toBe(12)
  })
})

describe('falaDaSerie — não inventa o que não foi dito', () => {
  it('frase vazia: não entendeu nada', () => {
    const r = falaDaSerie('')
    expect(r.entendeu).toBe(false)
    expect(r.pesoKg).toBeUndefined()
    expect(r.reps).toBeUndefined()
    expect(r.rpe).toBeUndefined()
  })

  it('fala sem nenhum número reconhecível: não entendeu', () => {
    const r = falaDaSerie('não consegui fazer hoje')
    expect(r.entendeu).toBe(false)
  })

  it('número SEM unidade nenhuma não vira peso (ambíguo demais)', () => {
    const r = falaDaSerie('100')
    expect(r.pesoKg).toBeUndefined()
    expect(r.entendeu).toBe(false)
  })

  it('RPE fora de 0–10 é descartado', () => {
    const r = falaDaSerie('rpe 15')
    expect(r.rpe).toBeUndefined()
  })

  it('campo não dito nunca vira zero — Number("") é 0 e essa armadilha já mordeu o app', () => {
    const r = falaDaSerie('100kg')
    expect(r.reps).toBeUndefined()
    expect(r.rpe).toBeUndefined()
    expect(r.reps).not.toBe(0)
  })
})

describe('falaDaSerie — determinístico', () => {
  it('mesma entrada, mesma saída, sempre', () => {
    const entrada = 'oitenta e dois e meio quilos doze reps rpe 8'
    const a = falaDaSerie(entrada)
    const b = falaDaSerie(entrada)
    expect(a).toEqual(b)
  })
})
