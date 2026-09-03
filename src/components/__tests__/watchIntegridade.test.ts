import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards da integração com o Apple Watch.
 *
 * Swift não passa pelo CI deste repo — só compila na máquina de quem builda. Os
 * casos abaixo travam, lendo o fonte como texto, os defeitos que uma auditoria
 * de 02/09/2026 encontrou e que custavam ao usuário a corrida ou a série inteira.
 */
const ler = (p: string) => readFileSync(p, 'utf8')
const WATCH = 'ios/App/IronTracksWatch Watch App'

describe('sessão do HealthKit — pausar não pode perder a corrida', () => {
  const hk = ler(`${WATCH}/Services/HealthKitManager.swift`)

  it('pausado continua sendo sessão VIVA', () => {
    // O delegate fazia `isRunning = (toState == .running)`, e a tela trocava por
    // esse flag: pausar num semáforo levava à tela inicial, sem retomar.
    expect(hk).toMatch(/var hasActiveSession: Bool/)
    expect(hk).toMatch(/sessionState != \.ended && sessionState != \.notStarted/)
  })

  it('a sessão tem DONO — cardio e musculação não se adotam', () => {
    // Sem isto, a aba Cardio se desenhava como corrida por causa de um treino de
    // musculação da aba vizinha — sem GPS, sem cronômetro, sem rota.
    expect(hk).toMatch(/enum WorkoutKind/)
    expect(hk).toMatch(/@Published private\(set\) var activeKind: WorkoutKind\?/)
  })

  it('a query de frequência cardíaca é encerrada', () => {
    // Sobrevivia ao fim do treino e se somava à próxima: média inflada e
    // amostras duplicadas a partir do segundo treino.
    expect(hk).toMatch(/private func stopHeartRateQuery/)
    expect(hk).toMatch(/store\.stop\(q\)/)
  })

  it('recupera sessão órfã de app morto no meio do treino', () => {
    expect(hk).toMatch(/recoverActiveWorkoutSession/)
  })

  it('a rota é fechada no HealthKit e o tipo está autorizado para escrita', () => {
    // O routeBuilder era zerado sem `finishRoute`, então o treino ia sem mapa —
    // e `workoutRoute` nem estava em typesToShare, então a inserção falharia.
    expect(hk).toMatch(/finishRoute\(with:/)
    expect(hk).toMatch(/HKSeriesType\.workoutRoute\(\)/)
  })

  it('a duração desconta a pausa', () => {
    // `builder.startDate` cru é wall clock: quem pausasse 10 min tinha 10 min a
    // mais no registro salvo do que no cronômetro que viu.
    expect(hk).toMatch(/accumulatedActiveSeconds/)
  })

  it('permissão é verificada de verdade, não presumida', () => {
    // `requestAuthorization` não lança quando o usuário NEGA — o app marcava
    // autorizado e seguia com números zerados.
    expect(hk).toMatch(/authorizationStatus\(for: HKQuantityType\.workoutType\(\)\) == \.sharingAuthorized/)
  })
})

describe('telas — gate VIP e colisão entre abas', () => {
  const workout = ler(`${WATCH}/Views/WorkoutView.swift`)
  const cardio = ler(`${WATCH}/Views/CardioView.swift`)

  it('a sessão de musculação não começa só por deslizar até a aba', () => {
    // O `.onAppear` estava no Group de fora do gate: usuário free vendo o
    // paywall já ficava com treino aberto no app Saúde.
    expect(workout).toMatch(/guard session\.dashboard\.isVip else \{ return \}\s*\n\s*startSessionIfNeeded\(\)/)
  })

  it('encerrar o treino não mata a corrida da outra aba', () => {
    expect(workout).toMatch(/guard health\.activeKind == \.strength else/)
  })

  it('a tela de cardio só se ativa com sessão DELA', () => {
    expect(cardio).toMatch(/health\.hasActiveSession && health\.activeKind == \.cardio/)
  })

  it('GPS negado não inicia corrida em silêncio', () => {
    expect(cardio).toMatch(/case \.denied, \.restricted:/)
  })

  it('resumo perdido não recebe háptico de sucesso', () => {
    // Antes o app confirmava com vibração de sucesso um treino descartado.
    expect(cardio).toMatch(/guard let summary else \{[\s\S]{0,400}failure\(\)/)
  })
})

describe('GPS — o filtro não pode cortar o esporte', () => {
  const loc = ler(`${WATCH}/Services/LocationManager.swift`)

  it('o limiar de velocidade é por esporte', () => {
    // 45 km/h fixo descartava as descidas de bike: a distância do trecho sumia e
    // o traçado virava uma corda reta cortando a descida.
    expect(loc).toMatch(/SportProfile/)
    expect(loc).toMatch(/func configure\(for/)
  })

  it('o GPS continua com o pulso abaixado', () => {
    // 95% de uma corrida acontece com o braço abaixado; com background desligado
    // a distância congelava e o mapa virava uma linha reta.
    expect(loc).toMatch(/allowsBackgroundLocationUpdates = true/)
  })

  it('a tela liga o perfil antes de rastrear', () => {
    expect(ler(`${WATCH}/Views/CardioView.swift`)).toMatch(/location\.configure\(for: sport\.locationProfile\)/)
  })
})

describe('o Watch recebe o treino que está sendo feito', () => {
  it('prioriza a sessão ATIVA sobre o primeiro treino da lista', () => {
    // O servidor resolve o exercício contra a sessão ativa: mandar `workouts[0]`
    // fazia todo `set.log` voltar 404 e a série sumir sem aviso.
    const impl = ler('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx')
    const i = impl.indexOf('const watchNextWorkout')
    const bloco = impl.slice(i, impl.indexOf('}, [workouts', i) + 40)
    expect(bloco).not.toBe('')
    expect(bloco).toMatch(/ativoRaw\?\.workout/)
    expect(bloco).toMatch(/const w = doAtivo \?\? list\[0\]/)
    // E não trunca: treino de 10+ exercícios é o padrão do app.
    expect(bloco).not.toMatch(/exercises\.slice\(0, 12\)/)
  })
})

describe('design — a marca no pulso é a mesma do iPhone', () => {
  const brand = ler(`${WATCH}/DesignSystem/Brand.swift`)
  const telas = ['DashboardView', 'CardioView', 'CheckinView', 'WorkoutView', 'VipGatePaywallView']
    .map((v) => ({ nome: v, src: ler(`${WATCH}/Views/${v}.swift`) }))

  it('o dourado canônico existe num lugar só', () => {
    expect(brand).toMatch(/static let gold = Color\(red: 0xEA/)
    expect(brand).toMatch(/static let goldGradient/)
  })

  it('nenhuma tela reinventa o dourado à mão', () => {
    // Havia três dourados convivendo: #F2C74D escrito à mão, o Color.yellow do
    // sistema (#FFCC00) e o gradiente montado caso a caso.
    for (const { nome, src } of telas) {
      expect(src, `${nome} tem cor de marca escrita à mão`).not.toMatch(/Color\(red: 0\.95, green: 0\.78/)
      expect(src, `${nome} usa o amarelo do sistema`).not.toMatch(/\.tint\(\.yellow\)|foregroundStyle\(\.yellow\)/)
    }
  })

  it('card é superfície opaca, não preto sobre preto', () => {
    // Em OLED, preto a 40% sobre preto não separa card de fundo — só produz
    // banding em brilho baixo.
    expect(brand).toMatch(/static let surface = Color\(red: 0x15/)
    for (const { nome, src } of telas) {
      expect(src, `${nome} ainda usa preto translúcido como card`).not.toMatch(/Color\.black\.opacity\(0\.4\)/)
    }
  })

  it('piso tipográfico de 11pt — o pulso não é o iPhone', () => {
    // A 40 cm do olho, com o braço em movimento, 8–9pt é textura, não texto.
    for (const { nome, src } of telas) {
      expect(src, `${nome} tem texto abaixo do piso`).not.toMatch(/\.system\(size: [1-9](,|\))/)
    }
  })

  it('os botões de ícone puro têm nome para o VoiceOver', () => {
    // Quatro das cinco telas não tinham NENHUM rótulo: um botão de ícone sem
    // nome é, para quem usa VoiceOver, literalmente "botão".
    const cardio = telas.find((t) => t.nome === 'CardioView')!.src
    expect(cardio).toMatch(/accessibilityLabel\("Pausar"\)/)
    expect(cardio).toMatch(/accessibilityLabel\("Retomar"\)/)
    expect(cardio).toMatch(/accessibilityLabel\("Encerrar/)
  })
})
