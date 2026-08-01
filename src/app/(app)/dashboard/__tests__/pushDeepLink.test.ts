import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pathnameToView, viewToPath } from '../viewPath'

/**
 * Regressão: a push "Resumo da semana 💪" carregava o deep-link certo
 * (/dashboard/report/weekly?week=...), mas TOCAR nela só abria o app.
 *
 * Causa: o listener de `irontracks:push:navigate` tratava só 'workout_assigned' e 'message';
 * qualquer outro type caía num `return` e o `link` NUNCA era lido.
 *
 * Bônus achado no mesmo print: a notificação chegava DUPLICADA no iPhone, porque o cron
 * mandava o push (sendPushToAllPlatforms, iOS+Android) e o insertNotifications mandava outro
 * (APNs/iOS-only, e sem link).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('deep-link da push → view do resumo semanal', () => {
  it('a rota do deep-link mapeia pra view weeklySummary (ida e volta)', () => {
    expect(pathnameToView('/dashboard/report/weekly')).toBe('weeklySummary')
    expect(viewToPath('weeklySummary')).toBe('/dashboard/report/weekly')
  })

  // Source CRU de propósito: as asserções abaixo checam código que contém '//' dentro de
  // string (o guard anti-open-redirect) — o stripComments trataria isso como comentário.
  const shell = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')

  it('o listener LÊ o link do push (não só type message/workout_assigned)', () => {
    const block = shell.slice(shell.indexOf('const onPushNavigate'), shell.indexOf("removeEventListener('irontracks:push:navigate'"))
    expect(block).toMatch(/detail\?\.link/)
    expect(block).toMatch(/router\.push\(link\)/)
  })

  it('só navega pra caminho INTERNO (push forjada não vira open-redirect)', () => {
    const block = shell.slice(shell.indexOf('const onPushNavigate'), shell.indexOf("removeEventListener('irontracks:push:navigate'"))
    expect(block).toMatch(/link\.startsWith\('\/'\)/)
    expect(block).toMatch(/!link\.startsWith\('\/\/'\)/)
  })
})

describe('push do resumo semanal — sem duplicata e com link', () => {
  const cron = stripComments(readFileSync('src/app/api/cron/muscle-weekly-insights/route.ts', 'utf8'))
  const notify = stripComments(readFileSync('src/lib/social/notifyFollowers.ts', 'utf8'))

  it('o push multiplataforma carrega o deep-link', () => {
    expect(cron).toMatch(/sendPushToAllPlatforms\(/)
    expect(cron).toMatch(/link: `\/dashboard\/report\/weekly\?week=\$\{weekStartDate\}`/)
  })

  it('o insertNotifications NÃO manda um 2º push (skipPush) — anti-duplicata no iOS', () => {
    expect(cron).toMatch(/insertNotifications\(notifs,\s*\{\s*skipPush:\s*true\s*\}\s*\)/)
  })

  it('insertNotifications honra o skipPush antes do fan-out', () => {
    expect(notify).toMatch(/opts\?\.skipPush/)
  })

  it('a notificação in-app também leva o link (tocar na lista abre o resumo)', () => {
    const row = cron.slice(cron.indexOf("type: 'muscle_weekly_insights'"), cron.indexOf('metadata: { week_start'))
    expect(row).toMatch(/link:/)
  })
})

/**
 * Regressão irmã (01/08): tocar no push "Nova solicitação de acesso" abria a
 * tela inicial em vez da fila de aprovação — com gente esperando do outro lado.
 *
 * Duas causas somadas:
 *   1. o push saía SEM link. `notifyAdmins` guarda o destino em `metadata.link`
 *      (a tabela `notifications` não tem coluna `link`) e o `insertNotifications`
 *      lia só `r.link`/`r.action_url`. O comentário no código afirmava que lia de
 *      metadata — afirmava, e não lia.
 *   2. o link apontava para `/admin?tab=requests`, que NÃO EXISTE em `app/`. O
 *      painel admin é uma `view` do dashboard. Consertar só a causa 1 teria
 *      trocado "abre a tela errada" por "abre um 404".
 */
describe('deep-link do push de admin → painel na aba certa', () => {
  const IMPL = stripComments(readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8'))
  const NOTIFY = stripComments(readFileSync('src/lib/social/notifyFollowers.ts', 'utf8'))
  const ADMIN = stripComments(readFileSync('src/lib/admin/adminNotifications.ts', 'utf8'))

  it('o push carrega o link guardado em metadata', () => {
    expect(NOTIFY).toMatch(/meta\?\.link/)
  })

  it('o tap resolve a aba pelo TYPE, não por rota inexistente', () => {
    // Pelo tipo funciona mesmo com o app já aberto em outra view — é o mesmo
    // motivo pelo qual 'workout_assigned' tem branch próprio logo acima.
    expect(IMPL).toMatch(/admin_new_signup: 'requests'/)
    expect(IMPL).toMatch(/admin_access_request: 'requests'/)
    expect(IMPL).toMatch(/openAdminPanel\(adminTab\)/)
    expect(IMPL).toMatch(/setView\('admin'\)/)
  })

  it('nenhum aviso de admin aponta para /admin — essa rota não existe', () => {
    // `find src/app -name "admin"` devolve só `api/admin` e `(app)/admin/
    // acquisition`; não há page.tsx em `/admin`.
    // Fonte CRU: `stripComments` apaga trechos demais neste arquivo e o guard
    // passaria mesmo com o link quebrado de volta (verificado).
    const raw = readFileSync('src/lib/admin/adminNotifications.ts', 'utf8')
    expect(raw).not.toMatch(/link: '\/admin/)
    expect(ADMIN).toContain('notifyAdminNewSignup')
  })

  it('a resolução por tipo vem ANTES do fallback genérico de link', () => {
    // Senão o `router.push(link)` genérico venceria e levaria pro lugar errado.
    // Fonte CRU aqui: `stripComments` estraga esta comparação, porque a linha do
    // fallback contém '//' dentro de uma string e o regex a trata como comentário.
    const raw = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')
    const porTipo = raw.indexOf('openAdminPanel(adminTab)')
    const fallback = raw.indexOf('router.push(link)')
    expect(porTipo).toBeGreaterThan(0)
    expect(fallback).toBeGreaterThan(porTipo)
  })
})
