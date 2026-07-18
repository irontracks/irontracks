import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')

describe('Android release safety guards', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const nativePlugin = read('android/app/src/main/java/com/irontracks/app/IronTracksNativePlugin.kt')
  const restReceiver = read('android/app/src/main/java/com/irontracks/app/RestTimerReceiver.kt')
  const restService = read('android/app/src/main/java/com/irontracks/app/RestTimerService.kt')
  const cardioService = read('android/app/src/main/java/com/irontracks/app/CardioLocationService.kt')

  it('does not request the restricted exact alarm permission', () => {
    expect(manifest).not.toContain('android.permission.USE_EXACT_ALARM')
    expect(manifest).toContain('android.permission.SCHEDULE_EXACT_ALARM')
    expect(nativePlugin).toContain('canScheduleExactAlarms()')
    expect(nativePlugin).toContain('setAndAllowWhileIdle')
    expect(restReceiver).toContain('canScheduleExactAlarms()')
  })

  it('keeps Android 7 vibration compatibility', () => {
    for (const source of [nativePlugin, restReceiver, restService]) {
      expect(source).toContain('Build.VERSION_CODES.O')
      expect(source).toContain('@Suppress("DEPRECATION")')
    }
  })

  it('keeps camera and microphone optional and excludes app data from backups', () => {
    expect(manifest).toMatch(/android\.hardware\.camera" android:required="false"/)
    expect(manifest).toMatch(/android\.hardware\.microphone" android:required="false"/)
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')
  })

  it('does not clear an already active cardio route on repeated service starts', () => {
    expect(cardioService).toContain('if (!active)')
    expect(cardioService).toContain('if (intent != null) clear()')
  })
})

describe('Android distribution flow guards', () => {
  it('does not reload on the first service worker controller claim', () => {
    const source = read('src/components/ServiceWorkerRegister.tsx')
    expect(source).toContain('if (!controlledRef.current)')
    expect(source).toContain('controlledRef.current = true')
  })

  it('runs release lint and blocks accidental production publishing', () => {
    const release = read('scripts/android-release.sh')
    const submit = read('scripts/android-submit.mjs')
    expect(release).toContain(':app:lintRelease')
    expect(release).toContain('jarsigner -verify "$AAB_PATH"')
    expect(release).toContain('SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-nextjs}"')
    expect(release).toContain('ANDROID_CONFIRM_PRODUCTION')
    expect(submit).toContain("new Set(['internal', 'alpha', 'beta', 'production'])")
    expect(submit).toContain('ANDROID_CONFIRM_PRODUCTION')
  })

  it('publishes a public account deletion path', () => {
    const page = read('src/app/excluir-conta/page.tsx')
    expect(page).toContain('Excluir minha conta')
    expect(page).toContain('mailto:irontrackscompany@gmail.com')
  })
})
