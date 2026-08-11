import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseCookieOptions } from '@/utils/supabase/cookieOptions'

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const headers = requestHeaders ?? request.headers
  let response = NextResponse.next({ request: { headers } })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const hasAuthCookie = (() => {
    try {
      const cookies = request.cookies.getAll()
      return cookies.some((c) => {
        const name = String(c?.name || '')
        if (!name) return false
        return name.startsWith('sb-') || name.includes('supabase')
      })
    } catch {
      return false
    }
  })()
  if (!hasAuthCookie) return response

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...(options || {}) })
        })
      },
    },
  })

  // Enquanto o middleware esteve desativado (fev–ago/2026) esta linha era
  // inofensiva. Agora ela roda em TODA navegação: uma rejeição aqui — Supabase
  // fora do ar, DNS, timeout — sobe pelo middleware e vira 500 em todas as
  // páginas do site ao mesmo tempo. Renovar a sessão é MELHOR-ESFORÇO: falhou,
  // segue sem renovar (o usuário continua com o cookie que já tinha, e as rotas
  // autenticam por conta própria). Indisponibilidade de terceiro não pode
  // derrubar o app inteiro.
  try {
    await supabase.auth.getUser()
  } catch { /* melhor-esforço: navegação segue sem o refresh */ }
  return response
}
