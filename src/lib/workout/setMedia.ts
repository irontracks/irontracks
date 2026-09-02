/**
 * setMedia — foto/vídeo anexado à OBSERVAÇÃO de uma série (02/09/2026).
 *
 * O que o usuário quer: fotografar a máquina e saber se é a certa; filmar a
 * execução e perguntar "está correta?". A IA responde ao FINALIZAR o treino, e
 * a resposta aparece no histórico, no PDF e no painel do professor.
 *
 * A referência viaja DENTRO do log da série — `logs["exIdx-setIdx"].media` —,
 * que já é o JSON que vai para `workouts.notes`. Assim o relatório acha a mídia
 * no mesmo lugar em que acha a observação, sem join; a tabela
 * `workout_set_media` guarda o que o log não deve carregar (caminho no
 * storage, resposta da IA). Este módulo é a fonte única da FORMA dessa
 * referência e das regras de tamanho — o cliente que sobe e o servidor que
 * analisa leem daqui.
 */

export type SetMediaKind = 'photo' | 'video'

/** O que fica dentro do log da série. Pequeno de propósito: vai para o JSON de `workouts.notes`. */
export interface SetMediaRef {
  id: string
  kind: SetMediaKind
  /** MIME do arquivo enviado — a análise precisa dele para montar o part do Gemini. */
  mime: string
}

/** Fotos comprimidas no aparelho ficam bem abaixo disto; o teto é para vídeo. */
export const SET_MEDIA_MAX_BYTES = 60 * 1024 * 1024
/** Acima disto o vídeo vai pela Files API do Gemini, não inline (limite de ~20 MB por request). */
export const SET_MEDIA_INLINE_MAX_BYTES = 15 * 1024 * 1024
/** Por série. Mais que isso é galeria, não observação. */
export const SET_MEDIA_MAX_PER_SET = 3

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function mediaKindFromMime(mime: unknown): SetMediaKind | null {
  const m = String(mime ?? '').toLowerCase().trim()
  if (m.startsWith('image/')) return 'photo'
  if (m.startsWith('video/')) return 'video'
  return null
}

/** Lê a lista de mídias de um log, tolerando lixo (o log é JSON livre). */
export function readSetMedia(log: unknown): SetMediaRef[] {
  if (!isRecord(log) || !Array.isArray(log.media)) return []
  const out: SetMediaRef[] = []
  for (const raw of log.media) {
    if (!isRecord(raw)) continue
    const id = String(raw.id ?? '').trim()
    const kind = raw.kind === 'photo' || raw.kind === 'video' ? raw.kind : mediaKindFromMime(raw.mime)
    if (!id || !kind) continue
    out.push({ id, kind, mime: String(raw.mime ?? '').trim() })
  }
  return out
}

export interface CollectedSetMedia extends SetMediaRef {
  key: string
  exerciseIndex: number
  setIndex: number
  /** A observação da série — a pergunta do usuário para a IA. */
  question: string
}

/**
 * Varre os logs de uma sessão e devolve toda mídia anexada, com o índice do
 * exercício/série e a observação que a acompanha. É o que a finalização usa
 * para ligar as linhas de `workout_set_media` ao treino recém-gravado.
 */
export function collectSetMediaFromLogs(logs: unknown): CollectedSetMedia[] {
  if (!isRecord(logs)) return []
  const out: CollectedSetMedia[] = []
  for (const [key, log] of Object.entries(logs)) {
    const media = readSetMedia(log)
    if (!media.length) continue
    const [exRaw, setRaw] = key.split('-')
    const exerciseIndex = Number.parseInt(exRaw ?? '', 10)
    const setIndex = Number.parseInt(setRaw ?? '', 10)
    if (!Number.isFinite(exerciseIndex) || !Number.isFinite(setIndex)) continue
    const question = isRecord(log) ? String(log.notes ?? log.note ?? '').trim() : ''
    for (const m of media) out.push({ ...m, key, exerciseIndex, setIndex, question })
  }
  return out
}

/** Nome do exercício pelo índice, tolerando as duas grafias que a sessão usa. */
export function exerciseNameAt(exercises: unknown, exerciseIndex: number): string {
  if (!Array.isArray(exercises)) return ''
  const ex = exercises[exerciseIndex]
  return isRecord(ex) ? String(ex.name ?? '').trim() : ''
}
