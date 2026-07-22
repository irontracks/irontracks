import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard do callback de permissão do plugin nativo Android.
 *
 * Bug real, achado no emulador (Android 16 / API 36): o alarme de descanso
 * nunca tocava no Android. O logcat mostrava
 *
 *   Sending plugin error: ... "There is no PermissionCallback method
 *   registered for the name: handleNotificationPermResult"
 *
 * porque o callback estava anotado com @PluginMethod. O `requestPermissionForAlias`
 * do Capacitor resolve o nome procurando SÓ entre métodos @PermissionCallback —
 * e esse lookup também é usado no atalho de "permissão já concedida", então
 * falhava até para quem já tinha aceitado. O JS engolia a rejeição no catch e
 * `scheduleRestTimer` nunca era chamado: o RestTimerService (e todo o fix de
 * canal com USAGE_ALARM) era código morto em Android 13+.
 */
const plugin = readFileSync(
  join(
    process.cwd(),
    'android/app/src/main/java/com/irontracks/app/IronTracksNativePlugin.kt',
  ),
  'utf8',
)

/** Remove comentários — senão o texto explicativo acima dá falso-positivo. */
const code = plugin
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')

describe('permissão de notificação no plugin Android', () => {
  it('todo alvo de requestPermissionForAlias é anotado @PermissionCallback', () => {
    const alvos = [...code.matchAll(/requestPermissionForAlias\([^)]*"([A-Za-z0-9_]+)"\s*\)/g)]
      .map((m) => m[1])
    // Se um dia ninguém mais pedir permissão por alias, o teste não tem o que
    // travar — mas hoje pede, e a ausência indicaria remoção acidental.
    expect(alvos.length).toBeGreaterThan(0)
    for (const nome of alvos) {
      const decl = new RegExp(`@PermissionCallback\\s+(private\\s+)?fun\\s+${nome}\\s*\\(`)
      expect(code, `callback "${nome}" sem @PermissionCallback`).toMatch(decl)
    }
  })

  it('o callback não é exposto como @PluginMethod', () => {
    // @PluginMethod no callback é exatamente o que quebrava o lookup.
    expect(code).not.toMatch(/@PluginMethod\s+(private\s+)?fun\s+handleNotificationPermResult/)
  })

  it('a anotação está importada', () => {
    expect(code).toContain('import com.getcapacitor.annotation.PermissionCallback')
  })
})
