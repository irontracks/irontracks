import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O cardio do Apple Watch chega INTEIRO ao app.
 *
 * O relógio media três coisas que morriam no caminho (02/09/2026):
 *  • o ESPORTE escolhido na tela — o JS mandava 'running' fixo, e uma pedalada
 *    virava corrida no histórico;
 *  • o TRAÇADO — ia `route: []`, então a corrida do Watch não tinha mapa,
 *    enquanto a do iPhone tinha;
 *  • a FREQUÊNCIA CARDÍACA — `cardio_tracks` não tinha coluna, e o dado que só
 *    o relógio tem era o único descartado.
 */
const ler = (p: string) => readFileSync(p, 'utf8')

describe('Watch → payload: nada se perde na ponte', () => {
  const provider = ler('src/components/WatchSyncProvider.tsx')

  it('manda o esporte escolhido, não "running" fixo', () => {
    expect(provider).toMatch(/activity_type:\s*summary\.activityType/)
    expect(provider, 'literal fixo aqui faz bike virar corrida').not.toMatch(/activity_type:\s*'running'/)
  })

  it('manda o traçado que o relógio gravou, não um array vazio', () => {
    expect(provider).toMatch(/route:\s*Array\.isArray\(summary\.route\)/)
    expect(provider).not.toMatch(/route:\s*\[\]\s*,/)
  })

  it('manda a frequência cardíaca e marca a origem', () => {
    expect(provider).toMatch(/avg_heart_rate:\s*summary\.avgHeartRate/)
    expect(provider).toMatch(/max_heart_rate:\s*summary\.maxHeartRate/)
    expect(provider).toMatch(/source:\s*'apple-watch'/)
  })
})

describe('rota de save: aceita e GRAVA o que o Watch manda', () => {
  const rota = ler('src/app/api/gps/cardio/save/route.ts')

  it('o schema aceita FC e origem', () => {
    expect(rota).toMatch(/avg_heart_rate:\s*z\.number\(\)/)
    expect(rota).toMatch(/max_heart_rate:\s*z\.number\(\)/)
    expect(rota).toMatch(/source:\s*z\.enum\(\['iphone', 'apple-watch'\]\)/)
  })

  it('o insert grava os três — aceitar sem gravar seria pior que recusar', () => {
    const i = rota.indexOf('.insert({')
    expect(i, 'o insert precisa existir — se sumiu, o guard perdeu o alvo').toBeGreaterThan(-1)
    let prof = 0
    let fim = i + '.insert('.length
    for (; fim < rota.length; fim++) {
      if (rota[fim] === '(') prof++
      else if (rota[fim] === ')') { prof--; if (prof === 0) break }
    }
    const bloco = rota.slice(i, fim + 1)
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/avg_heart_rate:\s*d\.avg_heart_rate/)
    expect(bloco).toMatch(/max_heart_rate:\s*d\.max_heart_rate/)
    // Sem `source`, sessão do iPhone ficaria indistinguível da do Watch.
    expect(bloco).toMatch(/source:\s*d\.source\s*\?\?\s*'iphone'/)
  })
})

describe('leitura: o dado gravado chega à tela', () => {
  it('a rota do histórico seleciona e devolve FC e origem', () => {
    const rota = ler('src/app/api/workouts/history/route.ts')
    expect(rota).toMatch(/avg_heart_rate, max_heart_rate, source/)
    expect(rota).toMatch(/avg_heart_rate:\s*c\.avg_heart_rate/)
    expect(rota).toMatch(/source:\s*c\.source/)
  })

  it('o cliente mapeia para o resumo da sessão', () => {
    const hook = ler('src/components/history/hooks/useHistoryData.ts')
    expect(hook).toMatch(/avgHeartRate:\s*w\.avg_heart_rate/)
    expect(hook).toMatch(/cardioSource:\s*w\.source/)
  })

  it('o modal EXIBE a FC — gravar sem mostrar é o defeito ao contrário', () => {
    const modal = ler('src/components/CardioSessionModal.tsx')
    expect(modal).toMatch(/session\.avgHeartRate/)
    expect(modal).toMatch(/bpm/)
    // Só quando há leitura: "—" numa sessão do iPhone anunciaria uma lacuna que
    // não é do usuário — ele não tem o sensor.
    expect(modal).toMatch(/Number\(session\.avgHeartRate\)\s*>\s*0\s*&&/)
  })
})

describe('Swift do Watch: o resumo carrega o que o servidor precisa', () => {
  it('WatchCardioSummary tem esporte e traçado', () => {
    const modelos = ler('ios/App/IronTracksWatch Watch App/Models/SharedModels.swift')
    expect(modelos).toMatch(/let activityType: String/)
    expect(modelos).toMatch(/let route: \[WatchRoutePoint\]/)
    // O ponto usa os MESMOS nomes do schema do servidor (lat/lng/ts/alt): nomear
    // diferente obrigaria o JS a traduzir campo a campo, e é aí que um traçado
    // se perde.
    expect(modelos).toMatch(/struct WatchRoutePoint[\s\S]{0,220}let lat: Double[\s\S]{0,120}let lng: Double/)
  })

  it('o esporte vira o vocabulário do servidor, não o rótulo em português', () => {
    const view = ler('ios/App/IronTracksWatch Watch App/Views/CardioView.swift')
    expect(view).toMatch(/var serverActivityType: String/)
    expect(view).toMatch(/case \.cycling: return "cycling"/)
    expect(view).toMatch(/activityType:\s*sport\.serverActivityType/)
    expect(view).toMatch(/route:\s*location\.trackPoints/)
  })

  it('o traçado é decimado ao teto do servidor, preservando o fim do percurso', () => {
    const hk = ler('ios/App/IronTracksWatch Watch App/Services/HealthKitManager.swift')
    // 10.000 é o `.max(10_000)` do saveTrackSchema: estourar devolveria 400 e a
    // sessão inteira se perderia por causa do traçado.
    expect(hk).toMatch(/decimateRoute\(route, limit: 10_000\)/)
    expect(hk).toMatch(/static func decimateRoute/)
  })
})
