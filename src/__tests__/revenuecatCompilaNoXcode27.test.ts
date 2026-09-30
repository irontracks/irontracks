import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O SDK iOS do RevenueCat TEM de ser >= 5.90.2 (30/09/2026).
 *
 * Até 5.67.1 o pacote não compila no Xcode 27: `PaywallColor` e
 * `CustomerCenterConfigData` dão "ambiguous use of init(stringRepresentation:)".
 * O Xcode Cloud (fluxo "Latest Release") passou ao Xcode 27 entre 13 e 18/09 e
 * ficou vermelho em 25+ execuções seguidas; o Mac do dono, ao atualizar para o
 * Xcode 27 em 26/09, travaria o `npm run ios:release` do mesmo jeito.
 *
 * Quem decide a versão do SDK iOS NÃO é este repositório: o plugin do Capacitor
 * fixa (`exact:`) o `purchases-hybrid-common`, e este fixa o `purchases-ios`.
 * Então reverter o plugin reabre o erro em silêncio — nada no JS reclama, só o
 * archive falha, dias depois. O teste olha as duas pontas: o pin do plugin
 * (hybrid-common) e o que o `Package.resolved` realmente resolveu.
 */

const ROOT = process.cwd()
const SDK_IOS_MINIMO = [5, 90, 2] as const
const HYBRID_MINIMO = [19, 3, 1] as const

function semver(v: string): number[] {
  return v.split('.').map((n) => Number(n))
}

function maiorOuIgual(v: string, minimo: readonly number[]): boolean {
  const a = semver(v)
  for (let i = 0; i < minimo.length; i++) {
    const x = a[i] ?? 0
    if (x !== minimo[i]) return x > minimo[i]
  }
  return true
}

function versaoResolvida(identity: string): string {
  const raw = readFileSync(
    join(ROOT, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'),
    'utf8',
  )
  const pins = (JSON.parse(raw) as { pins: { identity: string; state: { version?: string } }[] }).pins
  const pin = pins.find((p) => p.identity === identity)
  return pin?.state.version ?? ''
}

describe('RevenueCat compila no Xcode 27', () => {
  it('o Package.resolved resolve o SDK iOS em 5.90.2 ou mais novo', () => {
    const v = versaoResolvida('purchases-ios-spm')
    expect(v, 'purchases-ios-spm ausente do Package.resolved').not.toBe('')
    expect(maiorOuIgual(v, SDK_IOS_MINIMO), `purchases-ios-spm ${v} < 5.90.2 não compila no Xcode 27`).toBe(true)
  })

  it('o Package.resolved resolve o purchases-hybrid-common em 19.3.1 ou mais novo', () => {
    const v = versaoResolvida('purchases-hybrid-common')
    expect(v, 'purchases-hybrid-common ausente do Package.resolved').not.toBe('')
    expect(maiorOuIgual(v, HYBRID_MINIMO), `purchases-hybrid-common ${v} < 19.3.1`).toBe(true)
  })

  it('o plugin instalado fixa o mesmo hybrid-common que o Package.resolved resolveu', () => {
    const swift = readFileSync(
      join(ROOT, 'node_modules/@revenuecat/purchases-capacitor/Package.swift'),
      'utf8',
    )
    const m = swift.match(/purchases-hybrid-common\.git",\s*exact:\s*"([\d.]+)"/)
    expect(m, 'o Package.swift do plugin deixou de fixar o hybrid-common por exact:').not.toBeNull()
    expect(m![1]).toBe(versaoResolvida('purchases-hybrid-common'))
  })

  it('o package.json pede o plugin na linha 13 ou acima', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const pedido = pkg.dependencies['@revenuecat/purchases-capacitor'] ?? ''
    const base = pedido.replace(/^[\^~>=\s]+/, '')
    expect(maiorOuIgual(base, [13, 6, 1]), `plugin pedido: ${pedido}`).toBe(true)
  })
})
