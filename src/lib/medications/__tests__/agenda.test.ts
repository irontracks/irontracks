import { describe, it, expect } from 'vitest'
import {
  agruparPorHorario,
  chaveDaDose,
  dosesDoDia,
  dosesVencidasNaJanela,
  medicamentoValeNoDia,
  podeRegistrarTomada,
  removerDosesJaTomadas,
  textoDoLembrete,
  weekdayDoDia,
  type Dose,
  type MedicamentoAgendavel,
} from '../agenda'
import { janelaDeLembretes, type InstanteBrt } from '@/lib/nutrition/janelaDeLembrete'

// 2026-10-03 é SÁBADO; 2026-10-04 é DOMINGO.
const TODOS = [0, 1, 2, 3, 4, 5, 6]

const med = (over: Partial<MedicamentoAgendavel> = {}): MedicamentoAgendavel => ({
  id: 'm1',
  user_id: 'u1',
  name: 'Losartana',
  dose: '50 mg',
  times: ['08:00'],
  weekdays: TODOS,
  start_date: '2026-09-01',
  end_date: null,
  active: true,
  created_at: '2026-09-01T12:00:00Z',
  ...over,
})

const instante = (dateKey: string, hhmm: string): InstanteBrt => {
  const [h, m] = hhmm.split(':').map(Number)
  return { dateKey, weekday: weekdayDoDia(dateKey), minuto: h * 60 + m }
}

describe('weekdayDoDia', () => {
  it('lê o dia da semana do calendário, sem fuso local', () => {
    expect(weekdayDoDia('2026-10-03')).toBe(6)
    expect(weekdayDoDia('2026-10-04')).toBe(0)
    expect(weekdayDoDia('2026-10-05')).toBe(1)
  })
})

describe('medicamentoValeNoDia', () => {
  it('vale num dia dentro da validade', () => {
    expect(medicamentoValeNoDia(med(), '2026-10-03')).toBe(true)
  })

  it('não vale fora da lista de dias da semana', () => {
    const soSegunda = med({ weekdays: [1] })
    expect(medicamentoValeNoDia(soSegunda, '2026-10-03')).toBe(false) // sábado
    expect(medicamentoValeNoDia(soSegunda, '2026-10-05')).toBe(true) // segunda
  })

  it('não vale antes do start_date, e vale NO start_date', () => {
    const m = med({ start_date: '2026-10-10' })
    expect(medicamentoValeNoDia(m, '2026-10-09')).toBe(false)
    expect(medicamentoValeNoDia(m, '2026-10-10')).toBe(true)
  })

  it('end_date é inclusivo: vale no dia, não no seguinte', () => {
    const m = med({ end_date: '2026-10-10' })
    expect(medicamentoValeNoDia(m, '2026-10-10')).toBe(true)
    expect(medicamentoValeNoDia(m, '2026-10-11')).toBe(false)
  })

  it('pausado nunca vale', () => {
    expect(medicamentoValeNoDia(med({ active: false }), '2026-10-03')).toBe(false)
  })
})

describe('dosesVencidasNaJanela', () => {
  it('acha a dose cujo horário está na janela', () => {
    const doses = dosesVencidasNaJanela([med()], [instante('2026-10-03', '08:00')])
    expect(doses).toEqual([
      {
        userId: 'u1',
        medicationId: 'm1',
        nome: 'Losartana',
        dose: '50 mg',
        time: '08:00',
        dateKey: '2026-10-03',
      },
    ])
  })

  it('não acha nada quando nenhum horário cai na janela', () => {
    expect(dosesVencidasNaJanela([med()], [instante('2026-10-03', '08:01')])).toEqual([])
  })

  it('virada da meia-noite: às 00:02 a dose das 23:58 é de ONTEM', () => {
    // 00:02 BRT de domingo 04/10 = 03:02Z. A janela cobre 23:57 de sábado em diante.
    const janela = janelaDeLembretes(new Date('2026-10-04T03:02:00Z'))
    const doses = dosesVencidasNaJanela([med({ times: ['23:58'] })], janela)
    expect(doses).toHaveLength(1)
    expect(doses[0].dateKey).toBe('2026-10-03')
    expect(doses[0].time).toBe('23:58')
  })

  it('virada: o dia da semana avaliado é o de ontem (sábado, não domingo)', () => {
    const janela = janelaDeLembretes(new Date('2026-10-04T03:02:00Z'))
    // só sábado: a dose de 23:58 de sábado vale, mesmo "hoje" sendo domingo
    expect(dosesVencidasNaJanela([med({ times: ['23:58'], weekdays: [6] })], janela)).toHaveLength(1)
    // só domingo: a dose de 23:58 pertence a sábado, então NÃO vale
    expect(dosesVencidasNaJanela([med({ times: ['23:58'], weekdays: [0] })], janela)).toEqual([])
  })

  it('virada: end_date de ontem ainda cobre a dose das 23:58 de ontem', () => {
    const janela = janelaDeLembretes(new Date('2026-10-04T03:02:00Z'))
    const doses = dosesVencidasNaJanela([med({ times: ['23:58'], end_date: '2026-10-03' })], janela)
    expect(doses).toHaveLength(1)
  })

  it('virada: start_date de hoje não cobre a dose das 23:58 de ontem', () => {
    const janela = janelaDeLembretes(new Date('2026-10-04T03:02:00Z'))
    const doses = dosesVencidasNaJanela([med({ times: ['23:58'], start_date: '2026-10-04' })], janela)
    expect(doses).toEqual([])
  })

  it('a dose de 00:01 numa janela que cruza a meia-noite é de HOJE', () => {
    const janela = janelaDeLembretes(new Date('2026-10-04T03:02:00Z'))
    const doses = dosesVencidasNaJanela([med({ times: ['00:01'] })], janela)
    expect(doses).toHaveLength(1)
    expect(doses[0].dateKey).toBe('2026-10-04')
  })

  it('não duplica a dose quando o mesmo horário está repetido na lista', () => {
    const doses = dosesVencidasNaJanela(
      [med({ times: ['08:00', '8:00', '08:00'] })],
      [instante('2026-10-03', '08:00')],
    )
    expect(doses).toHaveLength(1)
  })

  it('não duplica a dose quando dois instantes da janela casam o mesmo horário', () => {
    const doses = dosesVencidasNaJanela(
      [med()],
      [instante('2026-10-03', '08:00'), instante('2026-10-03', '08:00')],
    )
    expect(doses).toHaveLength(1)
  })

  it('remédio pausado nunca gera dose', () => {
    expect(
      dosesVencidasNaJanela([med({ active: false })], [instante('2026-10-03', '08:00')]),
    ).toEqual([])
  })

  it('remédio criado às 08:02 com horário 08:00 NÃO notifica no dia da criação', () => {
    // 08:02 BRT = 11:02Z
    const m = med({ created_at: '2026-10-03T11:02:00Z' })
    expect(dosesVencidasNaJanela([m], [instante('2026-10-03', '08:00')])).toEqual([])
  })

  it('remédio criado ANTES do horário notifica normalmente', () => {
    const m = med({ created_at: '2026-10-03T10:30:00Z' }) // 07:30 BRT
    expect(dosesVencidasNaJanela([m], [instante('2026-10-03', '08:00')])).toHaveLength(1)
  })

  it('a regra do created_at só vale no dia da criação: no dia seguinte o horário dispara', () => {
    const m = med({ created_at: '2026-10-03T11:02:00Z', start_date: '2026-10-03' })
    expect(dosesVencidasNaJanela([m], [instante('2026-10-04', '08:00')])).toHaveLength(1)
  })

  it('end_date inclusivo na janela: vale no último dia, não no seguinte', () => {
    const m = med({ end_date: '2026-10-03' })
    expect(dosesVencidasNaJanela([m], [instante('2026-10-03', '08:00')])).toHaveLength(1)
    expect(dosesVencidasNaJanela([m], [instante('2026-10-04', '08:00')])).toEqual([])
  })

  it('start_date futuro não gera dose', () => {
    const m = med({ start_date: '2026-10-05' })
    expect(dosesVencidasNaJanela([m], [instante('2026-10-03', '08:00')])).toEqual([])
  })
})

describe('chaveDaDose', () => {
  it('é estável para o mesmo horário em grafias diferentes', () => {
    expect(chaveDaDose('m1', '2026-10-03', '8:00')).toBe(chaveDaDose('m1', '2026-10-03', '08:00'))
  })
  it('muda com o remédio, o dia e o horário', () => {
    const base = chaveDaDose('m1', '2026-10-03', '08:00')
    expect(chaveDaDose('m2', '2026-10-03', '08:00')).not.toBe(base)
    expect(chaveDaDose('m1', '2026-10-04', '08:00')).not.toBe(base)
    expect(chaveDaDose('m1', '2026-10-03', '09:00')).not.toBe(base)
  })
})

const dose = (over: Partial<Dose> = {}): Dose => ({
  userId: 'u1',
  medicationId: 'm1',
  nome: 'Losartana',
  dose: '50 mg',
  time: '08:00',
  dateKey: '2026-10-03',
  ...over,
})

describe('removerDosesJaTomadas', () => {
  it('com DUAS doses no mesmo horário e só uma tomada, a outra continua pendente', () => {
    const a = dose({ medicationId: 'm1', nome: 'Losartana' })
    const b = dose({ medicationId: 'm2', nome: 'Metformina' })
    const resto = removerDosesJaTomadas(
      [a, b],
      [{ medication_id: 'm1', date: '2026-10-03', scheduled_time: '08:00' }],
    )
    expect(resto).toEqual([b])
  })

  it('tomada de outro dia ou de outro horário não remove a dose', () => {
    const a = dose()
    expect(
      removerDosesJaTomadas(
        [a],
        [
          { medication_id: 'm1', date: '2026-10-02', scheduled_time: '08:00' },
          { medication_id: 'm1', date: '2026-10-03', scheduled_time: '20:00' },
        ],
      ),
    ).toEqual([a])
  })

  it('sem tomadas devolve tudo', () => {
    const a = dose()
    expect(removerDosesJaTomadas([a], [])).toEqual([a])
  })
})

describe('agruparPorHorario', () => {
  it('um grupo por (usuário, dia, horário), doses ordenadas pelo nome', () => {
    const grupos = agruparPorHorario([
      dose({ medicationId: 'm2', nome: 'Metformina' }),
      dose({ medicationId: 'm1', nome: 'Losartana' }),
      dose({ medicationId: 'm3', nome: 'Vitamina D', time: '20:00' }),
      dose({ medicationId: 'm4', nome: 'Outra pessoa', userId: 'u2' }),
    ])
    expect(grupos).toHaveLength(3)
    expect(grupos[0]).toMatchObject({ userId: 'u1', time: '08:00' })
    expect(grupos[0].doses.map((d) => d.nome)).toEqual(['Losartana', 'Metformina'])
    expect(grupos[1]).toMatchObject({ userId: 'u1', time: '20:00' })
    expect(grupos[2]).toMatchObject({ userId: 'u2', time: '08:00' })
  })

  it('o mesmo horário em dias diferentes são grupos diferentes', () => {
    const grupos = agruparPorHorario([
      dose({ dateKey: '2026-10-03', time: '23:58' }),
      dose({ dateKey: '2026-10-04', time: '23:58' }),
    ])
    expect(grupos).toHaveLength(2)
  })
})

describe('textoDoLembrete', () => {
  it('uma dose com dose informada', () => {
    expect(textoDoLembrete([dose()])).toEqual({
      titulo: '💊 08:00 · Losartana · 50 mg',
      mensagem: 'Hora de tomar.',
    })
  })

  it('uma dose sem a dose informada não deixa ponta solta', () => {
    expect(textoDoLembrete([dose({ dose: null })]).titulo).toBe('💊 08:00 · Losartana')
  })

  it('várias doses viram contagem no título e lista no corpo', () => {
    const t = textoDoLembrete([
      dose({ nome: 'Losartana' }),
      dose({ medicationId: 'm2', nome: 'Metformina', dose: null }),
    ])
    expect(t.titulo).toBe('💊 08:00 · 2 medicamentos')
    expect(t.mensagem).toBe('Losartana · 50 mg\nMetformina')
  })

  it('lista longa corta por item e diz quantos ficaram de fora', () => {
    const muitas = Array.from({ length: 12 }, (_, i) =>
      dose({ medicationId: `m${i}`, nome: `Medicamento número ${i}`, dose: '500 mg' }),
    )
    const t = textoDoLembrete(muitas)
    expect(t.mensagem.length).toBeLessThanOrEqual(160)
    expect(t.mensagem).toMatch(/\n\+\d+$/)
  })
})

describe('dosesDoDia', () => {
  const meds = [
    med({ id: 'a', name: 'Zinco', times: ['20:00', '08:00'] }),
    med({ id: 'b', name: 'Losartana', times: ['08:00'] }),
    med({ id: 'c', name: 'Pausado', active: false }),
    med({ id: 'd', name: 'Só segunda', weekdays: [1] }),
    med({ id: 'e', name: 'Começa depois', start_date: '2026-10-20' }),
  ]

  it('ordena por horário e depois por nome, só com o que vale no dia', () => {
    const lista = dosesDoDia(meds, [], '2026-10-03')
    expect(lista.map((d) => `${d.time} ${d.nome}`)).toEqual([
      '08:00 Losartana',
      '08:00 Zinco',
      '20:00 Zinco',
    ])
  })

  it('marca como tomada só a dose casada, com o instante da tomada', () => {
    const lista = dosesDoDia(
      meds,
      [{ medication_id: 'a', date: '2026-10-03', scheduled_time: '08:00', taken_at: '2026-10-03T11:03:00Z' }],
      '2026-10-03',
    )
    const zinco8 = lista.find((d) => d.medicationId === 'a' && d.time === '08:00')
    const zinco20 = lista.find((d) => d.medicationId === 'a' && d.time === '20:00')
    const losartana = lista.find((d) => d.medicationId === 'b')
    expect(zinco8).toMatchObject({ tomada: true, takenAt: '2026-10-03T11:03:00Z' })
    expect(zinco20).toMatchObject({ tomada: false, takenAt: null })
    expect(losartana).toMatchObject({ tomada: false, takenAt: null })
  })

  it('tomada de outro dia não conta como tomada hoje', () => {
    const lista = dosesDoDia(
      [med()],
      [{ medication_id: 'm1', date: '2026-10-02', scheduled_time: '08:00', taken_at: 'x' }],
      '2026-10-03',
    )
    expect(lista[0].tomada).toBe(false)
  })
})

describe('podeRegistrarTomada', () => {
  it('só hoje', () => {
    expect(podeRegistrarTomada('2026-10-03', '2026-10-03')).toBe(true)
    expect(podeRegistrarTomada('2026-10-02', '2026-10-03')).toBe(false)
    expect(podeRegistrarTomada('2026-10-04', '2026-10-03')).toBe(false)
  })
  it('data vazia nunca pode', () => {
    expect(podeRegistrarTomada('', '')).toBe(false)
  })
})
