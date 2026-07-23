import { describe, it, expect } from 'vitest'
import { VIEWS, pathnameToView, viewToPath } from '../viewPath'

/**
 * A "view" do dashboard é derivada do pathname, e setView é um router.push. Se
 * viewToPath(v) não voltar pra v via pathnameToView, um setView(v) navega errado —
 * e um effect que insista vira loop ("history.replaceState() more than 100 times per
 * 10 seconds", visto no Sentry).
 *
 * Foi o caso de 'weeklySummary': pathnameToView o produzia, viewToPath caía no
 * default '/dashboard'. Estes testes travam a INVERSÃO pra toda view — uma nova sem
 * par quebra o CI, não a navegação em produção.
 */
describe('viewPath — inversão view ↔ pathname', () => {
  it('TODA view tem caminho próprio (nenhuma cai no default /dashboard por engano)', () => {
    for (const v of VIEWS) {
      if (v === 'dashboard') continue
      expect(viewToPath(v), `viewToPath('${v}') caiu no default`).not.toBe('/dashboard')
    }
  })

  it('viewToPath → pathnameToView volta pra MESMA view (é inversa)', () => {
    for (const v of VIEWS) {
      expect(pathnameToView(viewToPath(v)), `'${v}' não é inversa`).toBe(v)
    }
  })

  it('o bug reportado: weeklySummary agora tem par', () => {
    expect(viewToPath('weeklySummary')).toBe('/dashboard/report/weekly')
    expect(pathnameToView('/dashboard/report/weekly')).toBe('weeklySummary')
  })

  it('weeklySummary NÃO é confundido com report (o prefixo /report é mais curto)', () => {
    // /dashboard/report/weekly começa com /dashboard/report — a ordem no
    // pathnameToView tem que checar weekly ANTES de report.
    expect(pathnameToView('/dashboard/report/weekly')).toBe('weeklySummary')
    expect(pathnameToView('/dashboard/report/active')).toBe('report')
  })

  it('caminhos desconhecidos e vazios caem em dashboard', () => {
    expect(pathnameToView(null)).toBe('dashboard')
    expect(pathnameToView('/')).toBe('dashboard')
    expect(pathnameToView('/dashboard/qualquer-coisa')).toBe('dashboard')
    expect(viewToPath('inexistente')).toBe('/dashboard')
  })

  it('agenda: /dashboard/schedule é a view "schedule", não cai no dashboard', () => {
    // Bug real: 'schedule' não estava mapeada, então pathnameToView caía no
    // default 'dashboard'. O botão "Agenda" navegava pra /dashboard/schedule mas
    // o god component renderizava o dashboard (e o ScheduleClient, renderizado
    // pela page dentro do {children} display:none do layout, ficava invisível).
    expect(pathnameToView('/dashboard/schedule')).toBe('schedule')
    expect(viewToPath('schedule')).toBe('/dashboard/schedule')
  })

  it('casos que já funcionavam seguem iguais', () => {
    expect(pathnameToView('/dashboard')).toBe('dashboard')
    expect(pathnameToView('/dashboard/active')).toBe('active')
    expect(pathnameToView('/dashboard/chat/abc123')).toBe('directChat')
    expect(pathnameToView('/dashboard/chat')).toBe('chatList')
    expect(viewToPath('report')).toBe('/dashboard/report/active')
  })
})
