/**
 * Forma da mídia da série como o RELATÓRIO a lê (tela, PDF e painel do
 * professor consomem a mesma lista da rota `set-media/list`). Pura, sem I/O.
 */

export interface SetMediaView {
  id: string
  exerciseIndex: number
  setIndex: number
  exerciseName?: string | null
  kind: 'photo' | 'video'
  mime?: string | null
  question?: string | null
  aiStatus: 'pending' | 'analyzing' | 'analyzed' | 'failed' | 'skipped' | string
  aiAnswer?: string | null
  aiError?: string | null
  url?: string | null
  createdAt?: string | null
}

/** Chave igual à do log: "exIdx-setIdx". */
export function setMediaKey(m: Pick<SetMediaView, 'exerciseIndex' | 'setIndex'>): string {
  return `${m.exerciseIndex}-${m.setIndex}`
}

export function groupSetMediaByKey(items: unknown): Record<string, SetMediaView[]> {
  const out: Record<string, SetMediaView[]> = {}
  if (!Array.isArray(items)) return out
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const exerciseIndex = Number(r.exerciseIndex)
    const setIndex = Number(r.setIndex)
    if (!Number.isInteger(exerciseIndex) || !Number.isInteger(setIndex)) continue
    const kind = r.kind === 'video' ? 'video' : 'photo'
    const item: SetMediaView = {
      id: String(r.id ?? ''),
      exerciseIndex,
      setIndex,
      exerciseName: typeof r.exerciseName === 'string' ? r.exerciseName : null,
      kind,
      mime: typeof r.mime === 'string' ? r.mime : null,
      question: typeof r.question === 'string' ? r.question : null,
      aiStatus: String(r.aiStatus ?? 'pending'),
      aiAnswer: typeof r.aiAnswer === 'string' ? r.aiAnswer : null,
      aiError: typeof r.aiError === 'string' ? r.aiError : null,
      url: typeof r.url === 'string' ? r.url : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    }
    const k = setMediaKey(item)
    ;(out[k] ||= []).push(item)
  }
  return out
}

/**
 * O que a tela diz quando NÃO há resposta. `skipped` carrega o motivo: a
 * pessoa precisa saber que a IA não olhou por falta de VIP/cota, não achar
 * que a análise falhou.
 */
export function setMediaStatusText(m: Pick<SetMediaView, 'aiStatus' | 'aiError'>): string | null {
  switch (m.aiStatus) {
    case 'analyzed': return null
    case 'pending':
    case 'analyzing': return 'IA analisando…'
    case 'skipped':
      if (m.aiError === 'vip_required') return 'Análise por IA é recurso VIP.'
      if (m.aiError === 'daily_quota_exceeded') return 'Cota diária de análises esgotada — a mídia ficou guardada.'
      return 'A IA não analisou esta mídia.'
    case 'failed': return 'A IA não conseguiu analisar esta mídia.'
    default: return null
  }
}

export const SET_MEDIA_KIND_LABEL: Record<'photo' | 'video', string> = { photo: 'Foto', video: 'Vídeo' }
