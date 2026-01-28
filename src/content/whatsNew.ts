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

const toMs = (iso: string) => {
  try {
    const s = String(iso || '').trim()
    if (!s) return 0
    const t = new Date(s).getTime()
    return Number.isFinite(t) ? t : 0
  } catch {
    return 0
  }
}

export const getLatestWhatsNew = () => {
  const arr = Array.isArray(WHATS_NEW) ? WHATS_NEW.filter((x) => x && typeof x === 'object') : []
  if (!arr.length) return null
  const sorted = arr
    .slice()
    .sort((a, b) => toMs(String((b as any)?.dateIso || '')) - toMs(String((a as any)?.dateIso || '')) || String((b as any)?.id || '').localeCompare(String((a as any)?.id || '')))
  const latest = sorted[0]
  if (!latest) return null
  return latest
}
