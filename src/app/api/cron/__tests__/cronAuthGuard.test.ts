/**
 * Source-guard de CLASSE para os crons.
 *
 * Contexto: o mapa de cobertura (2026-07-28) mostrou 6 dos 16 crons sem
 * qualquer teste — entre eles `teacher-plan-suspend`, que rebaixa o plano de
 * professores pagantes, e `purge-soft-delete-bin`, que apaga registros de vez.
 * Todos ESTÃO autenticados hoje; o que não existia era algo que impedisse o
 * próximo cron de nascer aberto.
 *
 * Este teste varre TODOS os handlers de `src/app/api/cron/**` em vez de checar
 * um por um: um cron sem `isCronAuthorized` é uma URL pública capaz de apagar
 * dados ou disparar push em massa para toda a base.
 *
 * Se este teste falhar num cron novo, a correção é adicionar o guard ao cron —
 * nunca afrouxar a varredura.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CRON_DIR = path.join(process.cwd(), 'src/app/api/cron')

function listCronRoutes(): Array<{ name: string; file: string; src: string }> {
  return fs
    .readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '__tests__')
    .map((d) => {
      const file = path.join(CRON_DIR, d.name, 'route.ts')
      return { name: d.name, file, src: fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '' }
    })
    .filter((r) => r.src.length > 0)
}

const routes = listCronRoutes()

describe('crons — guard de autorização', () => {
  it('encontra os handlers de cron (sanidade da varredura)', () => {
    // Se este número cair pra zero, a varredura quebrou e os testes abaixo
    // passariam vazios — o pior tipo de guard falso.
    // Era 16 até ago/2026, quando `whatsapp-reactivation` foi removido junto com
    // o resto do sistema de WhatsApp (decisão do dono). O piso acompanha a
    // remoção real de um cron — não afrouxe por conveniência.
    expect(routes.length).toBeGreaterThanOrEqual(15)
  })

  it.each(routes.map((r) => [r.name, r] as const))(
    '%s exige isCronAuthorized',
    (_name, route) => {
      expect(route.src).toContain('isCronAuthorized')
    },
  )

  it.each(routes.map((r) => [r.name, r] as const))(
    '%s rejeita com 403 antes de tocar o banco',
    (_name, route) => {
      const guardIdx = route.src.indexOf('isCronAuthorized')
      const adminIdx = route.src.indexOf('createAdminClient(')
      expect(guardIdx).toBeGreaterThan(-1)
      // O guard tem que vir ANTES de instanciar o client de service-role.
      // Autorizar depois de já ter lido/escrito não autoriza nada.
      if (adminIdx > -1) expect(guardIdx).toBeLessThan(adminIdx)
      expect(route.src).toMatch(/status:\s*403/)
    },
  )

  it.each(routes.map((r) => [r.name, r] as const))(
    '%s não aceita segredo por query string',
    (_name, route) => {
      // Segredo em URL vaza em log de acesso, Referer e histórico. O contrato é
      // header Authorization (ver utils/cron/auth.ts).
      expect(route.src).not.toMatch(/searchParams\.get\(['"](secret|token|key)['"]\)/)
    },
  )
})

describe('utils/cron/auth — fail-closed', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/utils/cron/auth.ts'), 'utf-8')

  it('nega quando CRON_SECRET não está configurado', () => {
    // Sem isto, um deploy sem a env var abriria TODOS os crons de uma vez.
    expect(src).toMatch(/if\s*\(!expected\)\s*return false/)
  })

  it('compara o segredo em tempo constante', () => {
    expect(src).toContain('safeEqual')
    expect(src).not.toMatch(/authHeader\.slice\(7\)\s*===\s*expected/)
  })
})
