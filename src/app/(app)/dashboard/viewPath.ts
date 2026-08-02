/**
 * Mapeamento view ↔ pathname do dashboard.
 *
 * A "view" (dashboard/active/report/...) é DERIVADA do pathname, e `setView` é um
 * router.push. As duas funções abaixo TÊM que ser inversas: se `viewToPath(v)` não
 * volta pra `v` via `pathnameToView`, um `setView(v)` navega pro lugar errado — e se
 * um effect insistir em `setView(v)`, vira loop de navegação (o browser corta em
 * "history.replaceState() more than 100 times per 10 seconds").
 *
 * Foi o que aconteceu com 'weeklySummary': o pathnameToView o produzia, mas o
 * viewToPath não tinha o case e caía no default '/dashboard'. Estava só latente
 * (ninguém chamava setView('weeklySummary') ainda). O teste viewPath.test.ts trava a
 * inversão pra TODA view — uma nova sem par cai no CI, não em produção.
 */

/** Toda view que o app conhece — a fonte de verdade pros dois mapeamentos e o teste. */
export const VIEWS = [
  'dashboard',
  'history',
  'active',
  'weeklySummary',
  'report',
  'directChat',
  'chatList',
  'profile',
  'admin',
  'community',
  'assessments',
  'vip',
  'edit',
  'teacher',
  'schedule',
] as const

export type DashboardView = (typeof VIEWS)[number]

export function pathnameToView(pathname: string | null): DashboardView {
  if (!pathname) return 'dashboard'
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'dashboard'
  if (pathname.startsWith('/dashboard/history')) return 'history'
  if (pathname.startsWith('/dashboard/active')) return 'active'
  if (pathname.startsWith('/dashboard/report/weekly')) return 'weeklySummary'
  if (pathname.startsWith('/dashboard/report')) return 'report'
  if (pathname.startsWith('/dashboard/chat/') && pathname.length > '/dashboard/chat/'.length) return 'directChat'
  if (pathname === '/dashboard/chat' || pathname === '/dashboard/chat/') return 'chatList'
  if (pathname.startsWith('/dashboard/profile')) return 'profile'
  if (pathname.startsWith('/dashboard/schedule')) return 'schedule'
  if (pathname.startsWith('/dashboard/teacher')) return 'teacher'
  if (pathname.startsWith('/dashboard/admin')) return 'admin'
  if (pathname.startsWith('/dashboard/community')) return 'community'
  if (pathname.startsWith('/dashboard/assessments')) return 'assessments'
  if (pathname.startsWith('/dashboard/vip')) return 'vip'
  if (pathname.startsWith('/dashboard/edit')) return 'edit'
  return 'dashboard'
}

export function viewToPath(view: string): string {
  switch (view) {
    case 'dashboard': return '/dashboard'
    case 'history': return '/dashboard/history'
    case 'active': return '/dashboard/active'
    // weeklySummary FALTAVA aqui — caía no default '/dashboard' e quebrava a
    // inversão (ver o cabeçalho). O caminho tem que casar o pathnameToView acima.
    case 'weeklySummary': return '/dashboard/report/weekly'
    case 'report': return '/dashboard/report/active'
    case 'chatList': return '/dashboard/chat'
    case 'directChat': return '/dashboard/chat/_'
    case 'profile': return '/dashboard/profile'
    case 'teacher': return '/dashboard/teacher'
    case 'schedule': return '/dashboard/schedule'
    case 'admin': return '/dashboard/admin'
    case 'community': return '/dashboard/community'
    case 'assessments': return '/dashboard/assessments'
    case 'vip': return '/dashboard/vip'
    case 'edit': return '/dashboard/edit'
    default: return '/dashboard'
  }
}
