import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guards da Live Activity (Ilha Dinâmica + tela bloqueada).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * A Live Activity quebrou várias vezes (12+ commits de "fix"), sempre do mesmo
 * jeito: EM SILÊNCIO. Os guards de plataforma retornavam sem reportar, então nem
 * o Sentry nem os testes percebiam — só o dono, dias depois, olhando o celular.
 *
 * A telemetria (liveActivityTelemetry.test.ts) cobre o caminho "o Swift falhou".
 * Este arquivo cobre o que faltava: "o JS NUNCA CHEGOU A CHAMAR o Swift" e
 * "alguém encerrou a activity que acabou de nascer" — além da integridade do
 * alvo iOS, cuja perda mataria tudo sem nenhum sinal em CI.
 *
 * Se um destes testes falhar, NÃO relaxe a asserção: você está reintroduzindo
 * uma regressão que já custou dias de investigação.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const hookSrc = read('src/hooks/useWorkoutLiveActivity.ts')
const dashboardSrc = read('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx')
const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj')
const appPlist = read('ios/App/App/Info.plist')

describe('Vetor 1 — corrida do bridge Capacitor (a LA nunca nascia)', () => {
  it('o hook reavalia o bridge em vez de desistir no primeiro render', () => {
    // window.Capacitor pode não estar injetado no 1º render da WebView. Sem
    // reavaliação, o efeito de start nunca mais roda e a LA nunca nasce.
    expect(hookSrc).toMatch(/nativeReady/)
    expect(hookSrc).toMatch(/BRIDGE_MAX_TRIES/)
  })

  it('o efeito de start depende de nativeReady (senão nunca re-roda)', () => {
    expect(hookSrc).toMatch(/\}, \[workoutStartMs, nativeReady\]\)/)
  })

  it('o efeito de start NÃO volta a depender só de [workoutStartMs]', () => {
    // Regressão exata que matava a Live Activity.
    expect(hookSrc).not.toMatch(/\}, \[workoutStartMs\]\)/)
  })
})

describe('Vetor 2 — limpeza de órfãs matando a LA recém-criada', () => {
  /** Trecho do efeito de limpeza de Live Activity órfã. */
  const cleanupBlock = (() => {
    const start = dashboardSrc.indexOf('staleActivityCleanedRef')
    expect(start, 'bloco de limpeza de LA órfã não encontrado').toBeGreaterThan(-1)
    return dashboardSrc.slice(start, start + 1800)
  })()

  it('espera a sessão assentar antes de encerrar (não mata a LA nova)', () => {
    // `activeSession` chega async; encerrar assim que as settings carregam
    // derrubava a activity que o ActiveWorkout tinha acabado de iniciar.
    expect(cleanupBlock).toMatch(/setTimeout/)
  })

  it('não encerra a LA quando existe sessão ativa', () => {
    expect(cleanupBlock).toMatch(/if \(activeSession\)/)
  })
})

describe('Vetor 3 — integridade do alvo iOS (perder isso mata tudo, sem sinal)', () => {
  it('o target IronTracksWidgets existe e é uma app-extension', () => {
    expect(pbxproj).toMatch(/IronTracksWidgets/)
    expect(pbxproj).toMatch(/com\.apple\.product-type\.app-extension/)
  })

  it('a extensão é embutida no app (Embed App Extensions)', () => {
    // Sem a fase de embed, o widget não vai no .ipa e a LA não existe no device.
    expect(pbxproj).toMatch(/Embed App Extensions/)
    expect(pbxproj).toMatch(/IronTracksWidgets\.appex/)
  })

  it('os fontes da Live Activity seguem no alvo do widget', () => {
    for (const f of ['RestTimerAttributes.swift', 'RestTimerWidget.swift', 'IronTracksWidgets.swift']) {
      expect(pbxproj, `${f} sumiu do projeto`).toContain(f)
    }
  })

  it('o Info.plist do app declara suporte a Live Activities', () => {
    // Sem esta chave o ActivityKit recusa Activity.request() em runtime.
    expect(appPlist).toMatch(/NSSupportsLiveActivities/)
  })
})
