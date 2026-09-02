import { escapeHtml } from '@/utils/escapeHtml'
import { SET_MEDIA_KIND_LABEL, setMediaStatusText, type SetMediaView } from '@/lib/workout/setMediaView'

/**
 * Linhas do PDF para a foto/vídeo da série: o tipo, a pergunta do aluno e a
 * resposta da IA — só texto. A mídia em si não entra no arquivo (URL
 * assinada expira e o PDF é para durar); a resposta é o que o avaliador
 * externo precisa ler ao lado da observação.
 */
export function buildSetMediaRowsHtml(items: SetMediaView[], colSpan: number): string {
  return items.map((m) => {
    const kind = SET_MEDIA_KIND_LABEL[m.kind === 'video' ? 'video' : 'photo']
    const status = setMediaStatusText(m)
    const answer = String(m.aiAnswer || '').trim()
    const corpo = answer
      ? `<strong style="color:#facc15">IA:</strong> ${escapeHtml(answer)}`
      : `<span style="color:#a3a3a3">${escapeHtml(status || 'Sem resposta da IA.')}</span>`
    return `<tr><td colspan="${colSpan}" class="td-note" style="font-style:normal"><span class="set-tag">${m.kind === 'video' ? '🎥' : '📷'} ${escapeHtml(kind)}</span> ${corpo}</td></tr>`
  }).join('')
}
