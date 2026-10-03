/**
 * @module utils/navigation/appPath
 *
 * Destino de navegação de PÁGINA INTEIRA dentro do app — sempre sob `/app`.
 *
 * ⚠️ Por que existe (02/10/2026): no iPhone, "Sair" abria o Safari e a conta
 * continuava logada no app, então não dava para trocar de conta. O app nativo
 * carrega `server.url = https://irontracks.com.br/app`, e o Capacitor (iOS,
 * `WebViewDelegationHandler`) só considera "do app" a navegação cujo endereço
 * COMEÇA com esse texto (`navURL.absoluteString.starts(with: serverURL)`).
 * Qualquer outro endereço — inclusive `https://irontracks.com.br/auth/logout`,
 * mesmo domínio — é entregue ao sistema, que abre o Safari. O handler de sair
 * fazia `window.location.href = '/auth/logout'`: na web o rewrite de
 * `next.config.ts` serve `/app/auth/logout` por baixo, no app a navegação nem
 * chega a acontecer dentro dele.
 *
 * Vale para `window.location.*`, `<a href>` cru e `<Link>` que caia em
 * navegação completa (rota de API/route handler). Navegação client-side do
 * Next (`router.push`, `<Link>` para página) não passa por esse filtro.
 *
 * Regra: navegação de página inteira para uma rota do app passa por
 * `caminhoDoApp()`. A raiz `/` é a LANDING comercial desde 26/09/2026 — para o
 * app ela significa a tela de entrada, `/app`.
 */

/**
 * Prefixos servidos por rewrite `/x` → `/app/x` em `next.config.ts`. Um guard
 * compara esta lista com os rewrites: prefixo novo lá sem entrada aqui reprova.
 */
export const PREFIXOS_DO_APP = [
    '/dashboard',
    '/auth',
    '/wait-approval',
    '/onboarding',
    '/assessments',
    '/marketplace',
    '/checkin',
    '/profile',
    '/history',
    '/relatorio',
    '/social',
    '/community',
    '/excluir-conta',
    '/para-professores',
    '/r',
    '/admin',
    '/offline',
] as const

function casaPrefixo(pathname: string): boolean {
    return PREFIXOS_DO_APP.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function reescreverCaminho(pathname: string): string {
    if (pathname === '/app' || pathname.startsWith('/app/')) return pathname
    if (pathname === '/' || pathname === '') return '/app'
    if (casaPrefixo(pathname)) return `/app${pathname}`
    return pathname
}

/**
 * Leva um destino do app para debaixo de `/app`. Aceita caminho (`/dashboard?x=1`)
 * ou URL absoluta do MESMO domínio; URL de outro domínio e esquemas como
 * `mailto:` voltam intactos.
 */
export function caminhoDoApp(destino: string, origem?: string): string {
    const raw = String(destino ?? '').trim()
    if (!raw) return '/app'

    if (raw.startsWith('/') && !raw.startsWith('//')) {
        const corte = raw.search(/[?#]/)
        const pathname = corte === -1 ? raw : raw.slice(0, corte)
        const resto = corte === -1 ? '' : raw.slice(corte)
        return reescreverCaminho(pathname) + resto
    }

    const base = origem ?? (typeof window !== 'undefined' ? window.location.origin : undefined)
    if (!base) return raw
    try {
        const url = new URL(raw)
        if (url.origin !== new URL(base).origin) return raw
        url.pathname = reescreverCaminho(url.pathname)
        return url.toString()
    } catch {
        return raw
    }
}

/** `window.location` para um destino do app, já sob `/app`. */
export function navegarNoApp(destino: string, opts?: { replace?: boolean }): void {
    if (typeof window === 'undefined') return
    const alvo = caminhoDoApp(destino)
    if (opts?.replace) window.location.replace(alvo)
    else window.location.href = alvo
}
