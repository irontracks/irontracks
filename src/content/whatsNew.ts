export type WhatsNewEntry = {
  id: string
  title: string
  dateIso: string
  items: string[]
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-04-24-v1.6-push',
    title: 'Notificações em Tempo Real',
    dateIso: '2026-04-24',
    items: [
      '🔔 Notificações sociais: saiba quando um amigo entra no app ou inicia um treino.',
      '📲 Banners aparecem mesmo com o app aberto, sem perder nenhum aviso.',
      '⚡ Entregas mais rápidas e confiáveis — notificações chegam sem atraso.',
      '🆕 Aviso dentro do app quando uma nova versão estiver disponível na App Store.',
    ],
  },
  {
    id: '2026-02-03-coach-ia-2.0',
    title: 'Nova Era do Iron Coach IA',
    dateIso: '2026-02-03',
    items: [
      '🧠 Iron Coach 2.0: Muito mais inteligente, usando o modelo Gemini Flash para análises profundas.',
      '💬 Chat Limitado: Usuários gratuitos agora têm 10 mensagens para testar o poder da IA.',
      '👑 VIP Elite: Nova experiência exclusiva para assinantes de alto nível.',
      '✨ Interface Renovada: Botões de ação mais acessíveis e nova janela de boas-vindas.',
      '🚀 Marketplace: Veja claramente os limites e benefícios de cada plano VIP.'
    ],
  },
  {
    id: '2026-01-21',
    title: 'Atualizações anteriores',
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
    .sort((a, b) => toMs(String((b as Record<string, unknown>)?.dateIso || '')) - toMs(String((a as Record<string, unknown>)?.dateIso || '')) || String((b as Record<string, unknown>)?.id || '').localeCompare(String((a as Record<string, unknown>)?.id || '')))
  const latest = sorted[0]
  if (!latest) return null
  return latest
}
