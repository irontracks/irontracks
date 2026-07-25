/**
 * Testes do aviso "atualize o app".
 *
 * Invariantes que importam (o banner fala com TODOS os usuários nativos, então
 * um falso positivo manda a base inteira à loja sem ter o que baixar):
 *  1. Web nunca vê o banner.
 *  2. Android compara com a constante declarada, não com a API da Apple.
 *  3. Versão igual à instalada → NÃO avisa.
 *  4. A constante do Android nunca pode passar da versão real do build.gradle
 *     (declarar uma versão não publicada é o modo de falha mais caro).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions } from '@/utils/version/compareVersions'
import { LATEST_ANDROID_VERSION } from '@/utils/version/latestNativeVersions'

const mockGetInfo = vi.fn()
vi.mock('@capacitor/app', () => ({ App: { getInfo: () => mockGetInfo() } }))

const platform = { isIosNative: false, isAndroidNative: false }
vi.mock('@/utils/platform', () => ({
  isIosNative: () => platform.isIosNative,
  isAndroidNative: () => platform.isAndroidNative,
}))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn() }))

import { useAppStoreUpdateCheck } from '../useAppStoreUpdateCheck'

describe('useAppStoreUpdateCheck', () => {
  beforeEach(() => {
    platform.isIosNative = false
    platform.isAndroidNative = false
    mockGetInfo.mockReset()
    window.localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('na web não avisa nada e nem lê a versão nativa', async () => {
    const { result } = renderHook(() => useAppStoreUpdateCheck())
    expect(result.current.updateAvailable).toBe(false)
    expect(mockGetInfo).not.toHaveBeenCalled()
  })

  it('Android avisa quando a versão publicada é mais nova que a instalada', async () => {
    platform.isAndroidNative = true
    // Instalada mais antiga que a constante declarada.
    mockGetInfo.mockResolvedValue({ version: '0.0.1' })

    const { result } = renderHook(() => useAppStoreUpdateCheck())
    await waitFor(() => expect(result.current.latestVersion).toBe(LATEST_ANDROID_VERSION))

    expect(result.current.updateAvailable).toBe(true)
    expect(result.current.appStoreUrl).toContain('play.google.com')
  })

  it('Android NÃO avisa quando já está na versão publicada', async () => {
    platform.isAndroidNative = true
    mockGetInfo.mockResolvedValue({ version: LATEST_ANDROID_VERSION })

    const { result } = renderHook(() => useAppStoreUpdateCheck())
    await waitFor(() => expect(result.current.latestVersion).toBe(LATEST_ANDROID_VERSION))

    expect(result.current.updateAvailable).toBe(false)
  })

  it('Android não consulta a API da Apple', async () => {
    platform.isAndroidNative = true
    mockGetInfo.mockResolvedValue({ version: '1.0.0' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useAppStoreUpdateCheck())
    await waitFor(() => expect(result.current.latestVersion).toBe(LATEST_ANDROID_VERSION))

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('dispensar o aviso silencia aquela versão', async () => {
    platform.isAndroidNative = true
    mockGetInfo.mockResolvedValue({ version: '0.0.1' })

    const { result } = renderHook(() => useAppStoreUpdateCheck())
    await waitFor(() => expect(result.current.updateAvailable).toBe(true))

    result.current.dismiss()
    await waitFor(() => expect(result.current.updateAvailable).toBe(false))
  })
})

describe('guard: constante do Android x build.gradle', () => {
  it('LATEST_ANDROID_VERSION nunca passa do versionName real', () => {
    // Declarar uma versão que não existe na loja manda a base inteira procurar
    // um update inexistente. O valor pode ficar ATRÁS (release ainda não
    // anunciado), nunca À FRENTE.
    const gradle = readFileSync(join(process.cwd(), 'android/app/build.gradle'), 'utf8')
    const match = /versionName\s+"([^"]+)"/.exec(gradle)
    expect(match, 'versionName não encontrado no build.gradle').toBeTruthy()
    const versionName = String(match?.[1])

    expect(
      compareVersions(LATEST_ANDROID_VERSION, versionName),
      `LATEST_ANDROID_VERSION (${LATEST_ANDROID_VERSION}) não pode ser maior que o versionName (${versionName})`,
    ).toBeLessThanOrEqual(0)
  })
})
