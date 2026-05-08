import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

export const dynamic = 'force-dynamic'

/**
 * GET /auth/logout
 *
 * Server-side cleanup:
 *   1. supabase.auth.signOut({ scope: 'local' }) — clears the HTTP-only cookies
 *   2. cookieStore.setAll(...) collects the cookie deletion headers and we
 *      attach them to the response below.
 *
 * Client-side cleanup (added in this fix):
 *   We can't clear localStorage from the server, so instead of returning a 302
 *   (which the browser follows without ever loading the page) we now return a
 *   tiny HTML page with a <script> that:
 *     • removes 'it.session.backup', 'it.logged_in', 'it_remembered_email'
 *       (the WKWebView fallback tokens — the previous version of this route
 *       left these intact, so on a shared device the next user could resume
 *       the previous user's session)
 *     • removes any leftover `sb-*` / `*supabase*` Supabase SDK keys
 *     • redirects to '/'
 *   The fallback <a> link covers users with JS disabled.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const originFromUrl = url.origin
  const forwardedHost = (request.headers.get('x-forwarded-host') || '').trim()
  const forwardedProto = (request.headers.get('x-forwarded-proto') || 'https').trim()
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseOrigin = forwardedHost && !isLocalEnv ? `${forwardedProto}://${forwardedHost}` : originFromUrl
  let safeOrigin = isLocalEnv && baseOrigin.includes('0.0.0.0') ? baseOrigin.replace('0.0.0.0', 'localhost') : baseOrigin
  if (!isLocalEnv) {
    try {
      const u = new URL(safeOrigin)
      u.protocol = 'https:'
      safeOrigin = u.origin
    } catch {}
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/', safeOrigin))
  }

  // Cookie deletion headers are accumulated here as the Supabase SSR client
  // calls setAll() during signOut.
  const cookiesToDelete: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []
  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) cookiesToDelete.push(c)
      },
    },
  })

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {}

  // Build the HTML response that runs the localStorage cleanup before
  // navigating to '/'.
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="cache-control" content="no-store" />
<title>Saindo…</title>
</head>
<body style="margin:0;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">
<div style="max-width:360px;width:100%;text-align:center">
<div style="font-weight:900;font-size:18px;margin-bottom:8px">Saindo…</div>
<div style="opacity:.7;font-size:13px;line-height:1.4;margin-bottom:16px">Encerrando a sua sessão.</div>
<a href="/" style="display:block;text-decoration:none;background:#facc15;color:#000;font-weight:900;padding:12px 14px;border-radius:12px">Continuar</a>
</div>
<script>
(function(){
  try {
    // App-specific WKWebView fallback tokens
    ['it.session.backup','it.logged_in','it_remembered_email','activeSession','appView'].forEach(function(k){
      try { localStorage.removeItem(k) } catch (e) {}
    });
    // Supabase SDK keys (sb-*, supabase, auth-token)
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('sb-') === 0 || k.indexOf('supabase') !== -1 || k.indexOf('auth-token') !== -1)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(function(k){ try { localStorage.removeItem(k) } catch (e) {} });
    // SessionStorage too
    try { sessionStorage.clear() } catch (e) {}
  } catch (e) {}
  try { window.location.replace('/') } catch (e) { window.location.href = '/' }
})();
</script>
</body>
</html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
  cookiesToDelete.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, { ...(options || {}) })
  })
  return response
}
