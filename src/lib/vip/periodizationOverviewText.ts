/**
 * Limpa marcação markdown crua do resumo da IA na Periodização VIP.
 *
 * Defesa nas DUAS pontas: o prompt em `periodizationCreate.ts` já pede texto sem
 * markdown, mas `vip_periodization_programs.config.overview` guarda o texto no
 * momento da criação — programas já salvos ANTES dessa instrução continuam com
 * `**negrito**` e `* item` crus, porque o overview nunca é regerado depois de
 * criado. Sem esta função eles mostrariam os asteriscos pra sempre.
 *
 * Função pura, sem HTML: monta texto plano, nunca `dangerouslySetInnerHTML` —
 * nada que vem do modelo vira HTML neste app.
 */
export const sanitizeOverviewText = (raw: unknown): string => {
  const text = typeof raw === 'string' ? raw : String(raw ?? '')
  if (!text.trim()) return ''

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      // Cabeçalho "# Título" / "## Título" → texto puro (extrai ANTES da
      // ênfase inline, senão "* item" colide com "*itálico*" na mesma linha).
      let l = line.replace(/^\s{0,3}#{1,6}\s+/, '')
      // Marcador de lista "* item" / "- item" / "+ item" → "• item"
      l = l.replace(/^(\s*)[*+-]\s+/, '$1• ')
      // Ênfase inline: negrito/itálico ** __ * _ → texto puro
      l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1')
      l = l.replace(/__([^_\n]+)__/g, '$1')
      l = l.replace(/\*([^*\n]+)\*/g, '$1')
      l = l.replace(/_([^_\n]+)_/g, '$1')
      return l
    })

  return lines.join('\n').trim()
}
