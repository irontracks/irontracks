import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard — GPS do cardio congelava no meio da corrida.
 *
 * Bug (2 usuários afetados): o cardio usava @capacitor/geolocation (watchPosition
 * via callback JS). Quando o iOS suspende o WebView (tela bloqueada / celular no
 * bolso), o callback para → a distância congela; o cronômetro segue (relógio de
 * parede). Print real: IronTracks 1,64 km / 25:21 vs Mi Fitness 4,01 km / 23:46.
 *
 * Fix: tracking nativo (CLLocationManager em background) que BUFFERIZA os fixes
 * nativamente e o JS DRENA o backlog no resume — nada se perde na suspensão.
 *
 * Estes guards travam os invariantes que, se removidos, ressuscitam o bug — sem
 * precisar de um device real no CI.
 */
describe('cardio GPS nativo — invariantes de background (TS)', () => {
  const hookSrc = readFileSync('src/hooks/useCardioTracking.ts', 'utf8')

  it('usa o tracker nativo (não só @capacitor/geolocation)', () => {
    expect(hookSrc).toContain('startNativeCardioLocation')
    expect(hookSrc).toContain('stopNativeCardioLocation')
    expect(hookSrc).toContain('drainNativeCardioLocations')
    expect(hookSrc).toContain('isNativeCardioLocationAvailable')
  })

  it('start/resume tentam o nativo ANTES de cair no web watch', () => {
    // O padrão nativo-primeiro-com-fallback deve aparecer em start e resume.
    const matches = hookSrc.match(/isNativeCardioLocationAvailable\(\)\s*&&\s*\(await startNative\(\)\)/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // E o fallback web precisa continuar existindo.
    expect(hookSrc).toContain('await startWatching()')
  })

  it('stop() drena o buffer nativo ANTES de montar o resultado', () => {
    // Sem isto, os últimos segundos de pontos ficam de fora do save.
    expect(hookSrc).toContain('await stopNative()')
    // stop() computa o resultado dos REFS (não do state), pois o drain é assíncrono.
    const stopIdx = hookSrc.indexOf('const stop = useCallback(async ()')
    expect(stopIdx).toBeGreaterThan(-1)
    const stopBlock = hookSrc.slice(stopIdx, stopIdx + 1200)
    expect(stopBlock).toContain('await stopNative()')
    expect(stopBlock).toContain('trackPointsRef.current')
    expect(stopBlock).toContain('distanceRef.current')
  })

  it('drena o buffer no resume do app (foreground)', () => {
    expect(hookSrc).toContain('appStateChange')
    expect(hookSrc).toContain('drainNativeRef')
    expect(hookSrc).toMatch(/visibilitychange/)
  })

  it('ingestFixes processa um LOTE (drain nativo), não só 1 fix', () => {
    expect(hookSrc).toContain('const ingestFixes = useCallback((fixes: GeoFix[])')
    // Loop por segmento sobre o array — é o que preserva a distância do gap.
    expect(hookSrc).toMatch(/for \(const fix of fixes\)/)
  })
})

describe('cardio GPS nativo — invariantes do plugin (Swift)', () => {
  const swiftSrc = readFileSync('ios/App/App/IronTracksNativePlugin.swift', 'utf8')

  it('ativa background location updates de verdade', () => {
    expect(swiftSrc).toContain('allowsBackgroundLocationUpdates = true')
    expect(swiftSrc).toContain('startUpdatingLocation()')
    expect(swiftSrc).toContain('pausesLocationUpdatesAutomatically = false')
  })

  it('bufferiza os fixes e expõe drain/stop pro JS', () => {
    expect(swiftSrc).toContain('cardioBuffer')
    expect(swiftSrc).toContain('func drainCardioLocations')
    expect(swiftSrc).toContain('func stopCardioLocation')
    expect(swiftSrc).toContain('func startCardioLocation')
  })

  it('didUpdateLocations distingue o manager do cardio (não interfere no geofence)', () => {
    expect(swiftSrc).toContain('didUpdateLocations')
    expect(swiftSrc).toContain('manager == cardioLocationManager')
  })

  it('registra os 3 métodos no bridge do plugin', () => {
    expect(swiftSrc).toContain('name: "startCardioLocation"')
    expect(swiftSrc).toContain('name: "stopCardioLocation"')
    expect(swiftSrc).toContain('name: "drainCardioLocations"')
  })
})
