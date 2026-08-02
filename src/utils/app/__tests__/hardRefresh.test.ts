import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { clearAppCaches } from '@/utils/app/hardRefresh'

/**
 * O botão "Limpar cache" das Configurações limpava só o `localStorage` — e o
 * que prende o app numa versão antiga é o SERVICE WORKER + CacheStorage. O
 * único botão que o usuário procuraria ao ver o app desatualizado não resolvia
 * o problema para o qual ele existe.
 *
 * Custou horas em ago/2026: o app rodando JS anterior enquanto o servidor já
 * tinha o deploy novo.
 */
describe('clearAppCaches', () => {
    const unregister = vi.fn()
    const cacheDelete = vi.fn()

    beforeEach(() => {
        unregister.mockReset().mockResolvedValue(true)
        cacheDelete.mockReset().mockResolvedValue(true)

        const store: Record<string, string> = {
            'irontracks.settings': '1',
            'irontracks.session': '2',
            'outro.app': '3',   // de terceiro — não pode ser tocado
        }
        const keys = () => Object.keys(store)

        vi.stubGlobal('window', {
            localStorage: {
                get length() { return keys().length },
                key: (i: number) => keys()[i] ?? null,
                removeItem: (k: string) => { delete store[k] },
                getItem: (k: string) => store[k] ?? null,
            },
            caches: true,
        })
        vi.stubGlobal('navigator', {
            serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] },
        })
        vi.stubGlobal('caches', {
            keys: async () => ['irontracks-static-abc', 'irontracks-runtime-abc'],
            delete: cacheDelete,
        })
        // `'caches' in window` precisa ser verdadeiro no ambiente do teste
        Object.defineProperty(globalThis, 'window', { value: { ...(globalThis as { window: object }).window, caches: true }, writable: true })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('desregistra os service workers — é o que prende a versão antiga', async () => {
        const r = await clearAppCaches()
        expect(unregister).toHaveBeenCalledTimes(2)
        expect(r.serviceWorkersUnregistered).toBe(2)
    })

    it('apaga o CacheStorage, onde mora o bundle', async () => {
        const r = await clearAppCaches()
        expect(cacheDelete).toHaveBeenCalledWith('irontracks-static-abc')
        expect(r.cachesDeleted).toBe(2)
    })

    it('limpa só as chaves do app no localStorage', async () => {
        const r = await clearAppCaches()
        expect(r.localStorageKeys).toBe(2)
        expect(window.localStorage.getItem('outro.app')).toBe('3')
    })
})

describe('o botão das Configurações usa a limpeza completa', () => {
    it('chama hardRefreshApp, não só localStorage', () => {
        const src = readFileSync('src/components/SettingsModal.tsx', 'utf8')
        expect(src).toContain('hardRefreshApp()')
        // O corpo antigo varria o localStorage inline — não pode voltar.
        expect(src).not.toMatch(/Limpar cache[\s\S]{0,80}window\.localStorage\.length/)
    })

    it('desregistra ANTES de apagar os caches', () => {
        // Um SW ativo pode repovoar o cache recém-limpo.
        const src = readFileSync('src/utils/app/hardRefresh.ts', 'utf8')
        expect(src.indexOf('unregister()')).toBeLessThan(src.indexOf('caches.delete'))
    })

    it('recarrega furando cache de HTTP', () => {
        const src = readFileSync('src/utils/app/hardRefresh.ts', 'utf8')
        expect(src).toMatch(/searchParams\.set\('_r'/)
    })
})
