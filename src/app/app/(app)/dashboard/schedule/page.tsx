// dashboard/schedule/page.tsx — view renderizada pelo IronTracksAppClient via
// pathnameToView (mesma convenção de history/active/teacher/etc). Esta page
// retorna null; o app vive em dashboard/layout.tsx, que renderiza {children}
// dentro de um <div style="display:none"> — por isso a page NÃO pode renderizar
// UI aqui (era o bug: o ScheduleClient ficava invisível e o god component
// mostrava o dashboard, porque 'schedule' não estava mapeada como view).
export const dynamic = 'force-dynamic'

export default function SchedulePage() {
  return null
}
