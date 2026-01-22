export type WhatsNewEntry = {
  id: string
  title: string
  dateIso: string
  items: string[]
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-01-21',
    title: 'Atualizações recentes',
    dateIso: '2026-01-21',
    items: ['Novas ferramentas no Dashboard: Novos Recordes, Iron Rank e Conquistas', 'Configurações do Dashboard: ativar/desativar ferramentas', 'Correções e ajustes visuais'],
  },
]

export const getLatestWhatsNew = () => {
  return Array.isArray(WHATS_NEW) && WHATS_NEW.length ? WHATS_NEW[0] : null
}

