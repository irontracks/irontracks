import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Telemetria da Live Activity em `audit_events`.
 *
 * Em 04/08/2026 a LA sumiu do iPhone do dono e o diagnóstico TRAVOU: o
 * `reportLiveActivityFailure` estava reportando certinho ao Sentry, mas o token
 * do Sentry não existe no repo nem no ambiente local — a pista existia e era
 * ilegível de onde o problema é investigado. `audit_events` responde a um
 * SELECT.
 *
 * Estes guards são source-guards de propósito: exercitar o caminho exigiria
 * Capacitor + rede + auth, e o que precisa ficar travado é o INVARIANTE (existe
 * reporte, não faz spam, não derruba o treino).
 */

const bridge = readFileSync(join(process.cwd(), 'src/utils/native/irontracksNative.ts'), 'utf8')
const route = readFileSync(join(process.cwd(), 'src/app/api/diag/live-activity/route.ts'), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('a falha vira registro consultável', () => {
  it('o bridge posta na rota de diagnóstico', () => {
    expect(code(bridge)).toContain("fetch('/api/diag/live-activity'")
  })

  it('a saída silenciosa de plataforma passou a reportar', () => {
    // Era um `if (!isIosNative()) return ''` mudo — a LA morria sem sinal nenhum.
    expect(code(bridge)).toContain("reportLiveActivityToAudit('not_native')")
  })

  it('a falha do Swift (id vazio / exceção) também vai pro banco', () => {
    expect(code(bridge)).toMatch(/reportLiveActivityToAudit\(reason,/)
  })
})

describe('não pode virar spam', () => {
  it('só o TREINO reporta — o descanso nasce e morre a cada série', () => {
    expect(code(bridge)).toMatch(/if \(kind === 'workout'\)/)
  })

  it('a web pura não gera evento: só reporta com Capacitor presente', () => {
    /*
     * Sem esta condição, TODO usuário do navegador geraria um evento por treino
     * (`isIosNative()` é falso na web por definição) e a tabela de auditoria
     * viraria lixo. Peguei isso relendo o próprio diff, antes de subir.
     */
    const trecho = code(bridge).slice(
      code(bridge).indexOf('startWorkoutLiveActivity'),
      code(bridge).indexOf('const activityId'),
    )
    expect(trecho).toMatch(/Capacitor[\s\S]*?reportLiveActivityToAudit\('not_native'\)/)
  })

  it('a rota tem rate limit', () => {
    expect(code(route)).toContain('checkRateLimitAsync')
  })
})

describe('telemetria nunca derruba o treino', () => {
  it('o post é fire-and-forget com catch', () => {
    expect(code(bridge)).toMatch(/\}\)\.catch\(\(\) => \{ \}\)/)
  })

  it('a rota responde ok mesmo quando a escrita falha', () => {
    // O app está no meio de um treino: um 500 aqui não pode virar erro na tela.
    const c = code(route)
    expect(c).toMatch(/if \(error\) logError/)
    expect(c).not.toMatch(/if \(error\) return NextResponse\.json\(\{ ok: false/)
  })
})

describe('a rota protege o que precisa', () => {
  it('exige usuário autenticado', () => {
    expect(code(route)).toContain('requireUser')
  })

  it('escreve com service-role — `audit_events` é read-only pro cliente', () => {
    expect(code(route)).toContain('createAdminClient')
  })

  it('valida o corpo com Zod strict', () => {
    expect(code(route)).toContain('.strict()')
    expect(code(route)).not.toContain('req.json()')
  })

  it('grava o que responde a pergunta: estágio, erro nativo e a permissão do iOS', () => {
    const c = code(route)
    for (const campo of ['stage', 'nativeError', 'activitiesEnabled', 'platform']) {
      expect(c).toContain(campo)
    }
  })
})
