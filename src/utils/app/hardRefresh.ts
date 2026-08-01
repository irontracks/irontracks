/**
 * Limpeza COMPLETA do app — o botão "Limpar cache" das Configurações.
 *
 * Ele limpava só o `localStorage`. O que prende o app numa versão antiga é
 * outra coisa: o **service worker** e o CacheStorage. Resultado: o único botão
 * que o usuário procuraria quando o app está desatualizado não resolvia o
 * problema que ele foi criado para resolver.
 *
 * Isso custou caro em ago/2026 — o app rodou horas com JS anterior enquanto o
 * servidor já tinha o deploy novo, e uma sessão inteira de correções foi
 * testada contra código velho.
 *
 * Ordem importa: desregistrar o SW ANTES de apagar os caches, senão um SW ainda
 * ativo pode repovoar o que acabou de ser limpo.
 */

export interface HardRefreshResult {
    localStorageKeys: number
    cachesDeleted: number
    serviceWorkersUnregistered: number
}

/** Chaves do app no localStorage — nunca mexe nas de terceiros. */
const APP_PREFIX = 'irontracks.'

export async function clearAppCaches(): Promise<HardRefreshResult> {
    const result: HardRefreshResult = { localStorageKeys: 0, cachesDeleted: 0, serviceWorkersUnregistered: 0 }
    if (typeof window === 'undefined') return result

    // 1. Service workers primeiro: enquanto um estiver ativo, ele pode
    //    reservir/repopular o cache que apagarmos em seguida.
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations()
            for (const reg of regs) {
                try {
                    if (await reg.unregister()) result.serviceWorkersUnregistered += 1
                } catch { /* uma falha não impede as outras */ }
            }
        }
    } catch { /* navegador sem suporte — segue */ }

    // 2. CacheStorage: é aqui que mora o bundle antigo.
    try {
        if ('caches' in window) {
            const keys = await caches.keys()
            for (const key of keys) {
                try {
                    if (await caches.delete(key)) result.cachesDeleted += 1
                } catch { /* idem */ }
            }
        }
    } catch { /* idem */ }

    // 3. localStorage do app (comportamento original preservado).
    try {
        const keys: string[] = []
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const k = window.localStorage.key(i)
            if (k && k.startsWith(APP_PREFIX)) keys.push(k)
        }
        for (const k of keys) {
            try { window.localStorage.removeItem(k); result.localStorageKeys += 1 } catch { /* idem */ }
        }
    } catch { /* idem */ }

    return result
}

/**
 * Limpa e recarrega já buscando do servidor.
 *
 * O `?_r=` quebra qualquer cache de HTTP que ainda responda pelo documento —
 * sem ele, um reload comum pode voltar a servir a mesma página do disco.
 */
export async function hardRefreshApp(): Promise<HardRefreshResult> {
    const result = await clearAppCaches()
    try {
        const url = new URL(window.location.href)
        url.searchParams.set('_r', String(Date.now()))
        window.location.replace(url.toString())
    } catch {
        try { window.location.reload() } catch { /* nada mais a fazer */ }
    }
    return result
}
