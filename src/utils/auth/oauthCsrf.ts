/**
 * oauthCsrf — token de defesa em profundidade pro fluxo OAuth.
 *
 * Por quê
 * ───────
 * Supabase já valida o parâmetro `state` internamente (via PKCE/state),
 * o que cobre o caso clássico de CSRF em OAuth. Esse helper adiciona
 * uma camada extra opt-in: um cookie HttpOnly gerado no início do fluxo
 * (/auth/login) e conferido no callback. Mitiga cenários onde:
 *   - O atacante consegue forjar uma URL completa de callback OAuth
 *     pré-construída pra "fixar" sessão na vítima
 *   - O state interno do Supabase tem falha em alguma versão futura
 *
 * Não bloqueia o fluxo se o cookie estiver ausente — só loga warning.
 * Isso permite rollout gradual sem quebrar logins em andamento durante
 * o deploy. Após uns dias de telemetria, pode virar enforcement.
 */

import { randomBytes } from 'node:crypto'

export const OAUTH_CSRF_COOKIE = 'it_oauth_csrf'
export const OAUTH_CSRF_MAX_AGE_SECONDS = 10 * 60 // 10 min — janela típica do fluxo OAuth

/** Gera token aleatório de 32 bytes em base64url (sem padding). */
export function generateOauthCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

export interface CsrfCookieOptions {
  name: string
  value: string
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
}

/**
 * Opções de cookie pro CSRF token. SameSite=Lax (não Strict) porque o
 * callback OAuth pode vir de redirect cross-site (provedor OAuth →
 * nosso callback). Lax permite cookies em top-level navigation GETs,
 * que é o caso aqui.
 */
export function buildOauthCsrfCookieOptions(value: string, isProduction: boolean): CsrfCookieOptions {
  return {
    name: OAUTH_CSRF_COOKIE,
    value,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_CSRF_MAX_AGE_SECONDS,
  }
}
