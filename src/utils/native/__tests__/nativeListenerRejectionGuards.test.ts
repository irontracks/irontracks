import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard: nenhum listener nativo pode deixar rejeição solta no REGISTRO.
 *
 * INCIDENTE QUE ORIGINOU ESTE TESTE
 * `"IronTracksNative" plugin is not implemented on ios` acumulou ~6.800 eventos
 * no Sentry (culprit /dashboard). Causa: `onNativeNotificationAction` registrava
 * o listener e só tratava a rejeição DENTRO da função de unsubscribe — que só
 * roda se alguém desinscrever. Em binário nativo antigo (sem o plugin), a
 * promise do `addListener` rejeita IMEDIATAMENTE → unhandledrejection.
 *
 * Por que importa: esse ruído mascarava falhas reais e dava a impressão de que
 * "o Sentry está limpo" quando features nativas estavam mortas.
 *
 * INVARIANTE: todo `addListener(...)` no bridge precisa de um `.catch(` logo em
 * seguida, neutralizando a rejeição no momento do registro.
 *
 * Se este teste falhar, adicione o `.catch` — NÃO afrouxe a asserção.
 */
const src = readFileSync(
  join(process.cwd(), 'src/utils/native/irontracksNative.ts'),
  'utf8',
)
const lines = src.split('\n')

/** Linhas que REGISTRAM um listener (chamada), ignorando as assinaturas do tipo. */
const registrationLines = lines
  .map((line, idx) => ({ line, idx }))
  // `addListener(` como chamada: precedido de `.` (Native.addListener / plugin.addListener?.)
  .filter(({ line }) => /\.addListener\??\.?\(/.test(line))

describe('Guard — rejeição de addListener neutralizada no registro', () => {
  it('encontra os registros de listener no bridge', () => {
    // Se cair pra zero, o padrão mudou e este guard virou inútil — falhe alto.
    expect(registrationLines.length).toBeGreaterThan(3)
  })

  it.each(registrationLines.map(({ idx }) => idx))(
    'o listener registrado na linha %i neutraliza a rejeição NO REGISTRO',
    (idx) => {
      // O `.catch` precisa vir ANTES do `return () =>` (a função de unsubscribe).
      // Um `.catch` só dentro do unsubscribe NÃO vale: ele só roda se alguém
      // desinscrever — e a rejeição já virou unhandledrejection muito antes.
      // Era exatamente esse o bug de onNativeNotificationAction.
      const after = lines.slice(idx + 1, idx + 30)
      const unsubIdx = after.findIndex((l) => /return\s*\(\s*\)\s*=>/.test(l))
      const beforeUnsub = (unsubIdx === -1 ? after : after.slice(0, unsubIdx)).join('\n')
      expect(
        /\.catch\(/.test(beforeUnsub),
        `addListener na linha ${idx + 1}: rejeição não neutralizada no registro — ` +
        'em binário nativo antigo (sem o plugin) isso vira unhandledrejection',
      ).toBe(true)
    },
  )
})
