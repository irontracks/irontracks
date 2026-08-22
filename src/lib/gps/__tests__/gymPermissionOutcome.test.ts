/**
 * Auto Check-in — o botão "Usar localização atual" não trava mais.
 *
 * Bug reproduzido no aparelho em 22/08/2026 (iPhone 17 Pro Max, iOS 26.5): com
 * "Permitir Durante o Uso do App", o botão ficava em "Capturando…" e continuava
 * assim depois de 2 minutos. O plugin Swift guarda a `CAPPluginCall`, pede o
 * upgrade para "Sempre" e espera um segundo callback que o iOS não manda — a
 * promise nunca resolvia e o `finally` que desliga o `busy` nunca rodava.
 *
 * Três invariantes, cada um cobrindo um jeito diferente de o bug voltar:
 *   1. a chamada nativa tem TETO (senão a UI trava de novo);
 *   2. `authorizedWhenInUse`/`timeout` SALVAM a academia (tratar como negado
 *      quebraria quem só pode dar "Durante o Uso");
 *   3. e AVISAM, porque a tela promete funcionar "mesmo com o app fechado".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveGymPermissionOutcome } from '../gymPermissionOutcome'

describe('resolveGymPermissionOutcome', () => {
    it('"Sempre" segue sem aviso — é o caso que a tela promete', () => {
        expect(resolveGymPermissionOutcome('authorizedAlways')).toEqual({ proceed: true, error: '', warning: '' })
    })

    it('negado/restrito BLOQUEIA e explica', () => {
        for (const status of ['denied', 'restricted']) {
            const r = resolveGymPermissionOutcome(status)
            expect(r.proceed, status).toBe(false)
            expect(r.error, status).toMatch(/Sempre/)
        }
    })

    it('"Durante o Uso" SALVA a academia e avisa do limite', () => {
        // Tratar como falha seria pior que o bug: o geofence funciona com o app
        // aberto, e quem não pode dar "Sempre" ficaria sem nada.
        const r = resolveGymPermissionOutcome('authorizedWhenInUse')
        expect(r.proceed).toBe(true)
        expect(r.error).toBe('')
        expect(r.warning).toMatch(/app aberto|Durante o Uso/i)
        expect(r.warning).toMatch(/Ajustes/)
    })

    it('timeout (o caminho que o iOS deixava pendurado) se comporta como "Durante o Uso"', () => {
        expect(resolveGymPermissionOutcome('timeout')).toEqual(resolveGymPermissionOutcome('authorizedWhenInUse'))
    })

    it('status desconhecido não bloqueia — o motor de geofence decide depois', () => {
        expect(resolveGymPermissionOutcome('vaiSaber').proceed).toBe(true)
    })
})

describe('requestAlwaysLocationPermission — teto', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.resetModules() })
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

    const carregar = async (nativeImpl: () => Promise<{ status: string }>) => {
        vi.doMock('@/utils/platform', () => ({
            isIosNative: () => true,
            isNativePlatform: () => true,
            isAndroidNative: () => false,
        }))
        vi.doMock('@capacitor/core', () => ({
            registerPlugin: () => ({ requestAlwaysLocationPermission: nativeImpl }),
            Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
        }))
        return import('@/utils/native/irontracksNative')
    }

    it('promise nativa pendurada resolve como "timeout" — não trava a tela', async () => {
        // O bug em uma linha: o Swift nunca resolve.
        const { requestAlwaysLocationPermission } = await carregar(() => new Promise(() => {}))
        const p = requestAlwaysLocationPermission()
        await vi.advanceTimersByTimeAsync(26_000)
        await expect(p).resolves.toBe('timeout')
    })

    it('resposta antes do teto vence', async () => {
        const { requestAlwaysLocationPermission } = await carregar(async () => ({ status: 'authorizedAlways' }))
        const p = requestAlwaysLocationPermission()
        await vi.advanceTimersByTimeAsync(10)
        await expect(p).resolves.toBe('authorizedAlways')
    })
})

describe('guard: o plugin Swift fecha a call em todos os caminhos', () => {
    const swift = readFileSync(
        join(process.cwd(), 'ios/App/App/IronTracksNativePlugin.swift'),
        'utf8'
    )
    // Só o código executável: o comentário que EXPLICA o bug cita os mesmos
    // nomes e faria o guard passar sozinho (armadilha nº 2 do repo).
    const code = swift.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

    it('a call pendente tem teto agendado', () => {
        expect(code).toMatch(/alwaysAuthTimeoutSeconds/)
        expect(code).toMatch(/asyncAfter[\s\S]{0,400}pendingAlwaysAuthCall/)
    })

    it('não abandona uma call pendente ao receber outra', () => {
        // Sobrescrever `pendingAlwaysAuthCall` sem resolver = promise órfã no JS.
        const trecho = code.slice(code.indexOf('func requestAlwaysLocationPermission'))
        const ate = trecho.slice(0, trecho.indexOf('func startGymGeofence'))
        expect(ate).toMatch(/if let orphan = pendingAlwaysAuthCall[\s\S]{0,200}orphan\.resolve/)
    })

    it('implementa o delegate do iOS 14+ e compartilha a rotina com o antigo', () => {
        expect(code).toMatch(/func locationManagerDidChangeAuthorization\(/)
        expect(code).toMatch(/func handleAuthorizationChange\(/)
        // Os dois delegam — se um deles reimplementar, divergem em silêncio.
        const chamadas = code.match(/handleAuthorizationChange\(/g) || []
        expect(chamadas.length).toBeGreaterThanOrEqual(3) // 1 declaração + 2 chamadas
    })
})
