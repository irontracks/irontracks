// Sub-rota fina: a UI é renderizada pelo shell (IronTracksAppClientImpl) via
// pathnameToView('/dashboard/report/weekly') -> view 'weeklySummary'. Como as demais
// sub-rotas do dashboard, a página em si é só um placeholder pra Next resolver a rota.
// Alvo do deep-link da push "Resumo da semana 💪" (?week=YYYY-MM-DD).
export default function WeeklySummaryRoute() {
  return null
}
