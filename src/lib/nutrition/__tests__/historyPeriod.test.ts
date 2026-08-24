import { describe, it, expect } from 'vitest'
import {
  MAX_DIAS_PERIODO,
  contarDias,
  formatarDataCurta,
  isDataValida,
  periodoDaJanela,
  resolverPeriodoPersonalizado,
  rotuloPeriodo,
  somarDias,
  sufixoArquivo,
} from '../historyPeriod'

const HOJE = '2026-08-24'

describe('datas do período', () => {
  it('recusa data que não existe no calendário', () => {
    // `new Date('2026-02-31')` não lança — rola para 3 de março. Sem a ida e
    // volta, um intervalo começando num dia inexistente viraria consulta com
    // outra data e o PDF cobriria um período diferente do pedido.
    expect(isDataValida('2026-02-31')).toBe(false)
    expect(isDataValida('2026-02-28')).toBe(true)
    expect(isDataValida('2026-13-01')).toBe(false)
    expect(isDataValida('24/08/2026')).toBe(false)
    expect(isDataValida('')).toBe(false)
    expect(isDataValida(null)).toBe(false)
  })

  it('atravessa a virada de mês e de ano sem escorregar um dia', () => {
    // O fuso do Brasil é UTC−3: qualquer conversão presa à meia-noite volta
    // para o dia anterior. É o mesmo defeito que pôs o treino das 22h no dia
    // seguinte no heatmap e errou o streak em 36 de 633 sessões.
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2024-03-01', -1)).toBe('2024-02-29') // bissexto
  })

  it('conta as DUAS pontas — o mesmo dia é 1 dia, não 0', () => {
    expect(contarDias('2026-08-24', '2026-08-24')).toBe(1)
    expect(contarDias('2026-08-18', '2026-08-24')).toBe(7)
    expect(contarDias('2026-05-01', '2026-07-31')).toBe(92)
  })
})

describe('janela fixa', () => {
  it('7 dias termina hoje e começa 6 dias atrás', () => {
    expect(periodoDaJanela(HOJE, 7)).toEqual({
      inicio: '2026-08-18', fim: HOJE, dias: 7, janelaFixa: 7,
    })
  })

  it('a janela de N dias tem exatamente N dias', () => {
    for (const n of [7, 15, 30, 90]) {
      const p = periodoDaJanela(HOJE, n)
      expect(contarDias(p.inicio, p.fim), `janela de ${n}`).toBe(n)
      expect(p.dias).toBe(n)
    }
  })
})

describe('período personalizado', () => {
  it('aceita um intervalo válido e conta os dias das duas pontas', () => {
    const r = resolverPeriodoPersonalizado('2026-05-01', '2026-07-31', HOJE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.periodo).toEqual({ inicio: '2026-05-01', fim: '2026-07-31', dias: 92, janelaFixa: null })
  })

  it('recusa intervalo invertido — geraria PDF vazio com cara de "não comeu nada"', () => {
    const r = resolverPeriodoPersonalizado('2026-07-31', '2026-05-01', HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/antes/i)
  })

  it('recusa fim no futuro — infla o denominador da cobertura com dias que não aconteceram', () => {
    const r = resolverPeriodoPersonalizado('2026-08-01', '2026-12-01', HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/futuro/i)
  })

  it('recusa datas incompletas', () => {
    expect(resolverPeriodoPersonalizado('', '2026-08-01', HOJE).ok).toBe(false)
    expect(resolverPeriodoPersonalizado('2026-08-01', '', HOJE).ok).toBe(false)
  })

  it('aceita exatamente o teto e recusa um dia além', () => {
    const fim = HOJE
    const noTeto = somarDias(fim, -(MAX_DIAS_PERIODO - 1))
    expect(resolverPeriodoPersonalizado(noTeto, fim, HOJE).ok).toBe(true)
    const acima = somarDias(fim, -MAX_DIAS_PERIODO)
    const r = resolverPeriodoPersonalizado(acima, fim, HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(String(MAX_DIAS_PERIODO))
  })

  it('o mesmo dia nas duas pontas é um período de 1 dia', () => {
    const r = resolverPeriodoPersonalizado(HOJE, HOJE, HOJE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.periodo.dias).toBe(1)
  })
})

describe('rótulos', () => {
  it('janela fixa é dita em dias; intervalo escolhido mostra as DATAS', () => {
    // "83 dias" não diz nada a quem recebe o relatório — e é justamente este
    // que vai para o nutricionista.
    expect(rotuloPeriodo(periodoDaJanela(HOJE, 7))).toBe('Últimos 7 dias')
    const r = resolverPeriodoPersonalizado('2026-05-01', '2026-07-31', HOJE)
    expect(r.ok && rotuloPeriodo(r.periodo)).toBe('01/05/2026 a 31/07/2026')
  })

  it('formata data no padrão brasileiro e sobrevive a lixo', () => {
    expect(formatarDataCurta('2026-08-24')).toBe('24/08/2026')
    expect(formatarDataCurta('nada')).toBe('nada')
  })

  it('o nome do arquivo carrega as duas pontas do período', () => {
    expect(sufixoArquivo(periodoDaJanela(HOJE, 7))).toBe('2026-08-18_2026-08-24')
  })
})
