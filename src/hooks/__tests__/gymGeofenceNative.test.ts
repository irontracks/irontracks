import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards do lado NATIVO do geofence (source-guard — Swift não roda no vitest).
 *
 * Dois defeitos achados em 03/08/2026 auditando por que o "Auto Check-in" nunca
 * fez check-in:
 *
 *  1. A notificação de chegada dizia "Toque para iniciar seu treino do dia" e
 *     apontava para a categoria GYM_GEOFENCE — que NÃO estava entre as
 *     registradas em setNotificationCategories. Categoria desconhecida não
 *     quebra nada visivelmente: a notificação aparece sem botão nenhum. Falha
 *     silenciosa clássica desta base.
 *  2. O throttle de 4 h vivia num `private var` em memória. O caso principal da
 *     feature é o app MORTO: o iOS relança o processo só pra entregar
 *     didEnterRegion, o plugin é recriado e o contador volta a zero — o guard
 *     não guardava nada exatamente onde deveria.
 *
 * O que estes testes NÃO provam: que a região dispara no aparelho. Isso é
 * conferência em device/simulador — aqui trava-se o contrato do código.
 */

const SWIFT = readFileSync('ios/App/App/IronTracksNativePlugin.swift', 'utf8')

const categoriesCall = SWIFT.slice(
  SWIFT.indexOf('setNotificationCategories'),
  SWIFT.indexOf('setNotificationCategories') + 400,
)

const didEnterRegion = SWIFT.slice(
  SWIFT.indexOf('func locationManager(_ manager: CLLocationManager, didEnterRegion'),
  SWIFT.indexOf('func locationManager(_ manager: CLLocationManager, monitoringDidFailFor'),
)

describe('notificação de chegada — a categoria precisa estar registrada', () => {
  it('GYM_GEOFENCE está entre as categorias passadas ao UNUserNotificationCenter', () => {
    expect(categoriesCall).toMatch(/gymGeofenceCategory/)
  })

  it('a categoria declara a ação que o texto promete', () => {
    const block = SWIFT.slice(SWIFT.indexOf('let startWorkoutAction'), SWIFT.indexOf('setNotificationCategories'))
    expect(block).toMatch(/identifier:\s*"START_WORKOUT"/)
    expect(block).toMatch(/identifier:\s*"GYM_GEOFENCE"/)
    // .foreground: a ação precisa ABRIR o app — é o JS que grava o check-in.
    expect(block).toMatch(/options:\s*\[\.foreground\]/)
  })

  it('o categoryIdentifier da notificação bate com o registrado', () => {
    // Divergir aqui faz o botão sumir sem erro nenhum — foi o estado anterior.
    const used = didEnterRegion.match(/categoryIdentifier\s*=\s*"([^"]+)"/)?.[1]
    expect(used).toBe('GYM_GEOFENCE')
    expect(categoriesCall.length).toBeGreaterThan(0)
  })

  it('o userInfo mantém o type que o cliente usa pra gravar o check-in', () => {
    // `usePushNotifications` → evento 'irontracks:push:navigate' com este type →
    // o dashboard grava o check-in. Renomear aqui quebra a cadeia inteira.
    expect(didEnterRegion).toMatch(/"type":\s*"gym_geofence"/)
  })
})

describe('throttle de 4h — precisa sobreviver ao app ser morto', () => {
  it('lastGeofenceFireMs persiste em UserDefaults, não em memória', () => {
    const decl = SWIFT.slice(SWIFT.indexOf('lastGeofenceFireKey'), SWIFT.indexOf('// ── Cardio GPS state'))
    expect(decl).toMatch(/UserDefaults\.standard\.double\(forKey:/)
    expect(decl).toMatch(/UserDefaults\.standard\.set\(newValue, forKey:/)
    // O `private var ... = 0` era o bug: zerava a cada relançamento.
    expect(SWIFT).not.toMatch(/private var lastGeofenceFireMs:\s*Double\s*=\s*0/)
  })

  it('a janela continua sendo de 4 horas', () => {
    expect(didEnterRegion).toMatch(/4 \* 60 \* 60 \* 1000/)
  })

  it('relógio andando pra trás não trava a notificação para sempre', () => {
    // Com o valor persistido, uma data futura gravada (troca de fuso/hora do
    // sistema) bloquearia toda chegada até o tempo alcançar — pior que não ter guard.
    expect(didEnterRegion).toMatch(/sinceLast >= 0/)
  })
})
