/**
 * Coalescedor de refresh da fileira de stories.
 *
 * Contexto: o canal Realtime `stories-auto-refresh` (StoriesBar) escuta INSERT em
 * `social_stories` SEM filtro de coluna — postgres_changes só aceita comparação
 * simples numa coluna, e "autores que eu sigo" é um join, então não dá pra
 * recortar no filtro. O recorte de quem PODE ver a linha é da RLS da tabela
 * (`can_view_story`), não do cliente.
 *
 * O que era problema de verdade no cliente: cada evento entregue agendava o SEU
 * PRÓPRIO `setTimeout(() => reload(true), 1500)`. Um amigo postando 3 stories em
 * sequência virava 3 GETs em `/api/social/stories/list?nocache=1` — e o
 * `nocache=1` FURA o cache da rota, então cada um refaz a query e re-assina até
 * 200 URLs de mídia. Pior: disparava com o app em background.
 *
 * Este scheduler resolve os dois: um único timer (debounce trailing, rajada → 1
 * refresh) e nada de fetch com a aba/app oculto — o refresh fica pendente e sai
 * quando volta a ficar visível (`flushOnVisible`).
 *
 * O caminho PRIMÁRIO de atualização continua sendo o evento window
 * `irontracks:stories:refresh` (imediato, disparado por quem postou); o Realtime
 * é o caminho de reserva para o story do amigo — daí poder ser mais lento.
 */

export const STORIES_REALTIME_DEBOUNCE_MS = 4000

export type StoriesRefreshScheduler = {
  /** Um evento de story chegou: agenda (ou re-agenda) o refresh coalescido. */
  request: () => void
  /** Chamar quando a aba/app volta a ficar visível: solta o refresh pendente. */
  flushOnVisible: () => void
  /** Cleanup do efeito: cancela o pendente e neutraliza o scheduler. */
  dispose: () => void
}

export function createStoriesRefreshScheduler(opts: {
  onRefresh: () => void
  delayMs?: number
  /** Default: `document.visibilityState === 'hidden'`. */
  isHidden?: () => boolean
}): StoriesRefreshScheduler {
  const delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : STORIES_REALTIME_DEBOUNCE_MS
  const isHidden = opts.isHidden ?? (() => {
    try { return typeof document !== 'undefined' && document.visibilityState === 'hidden' } catch { return false }
  })

  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let disposed = false

  const clear = () => {
    if (timer !== null) { clearTimeout(timer) ; timer = null }
  }

  const fire = () => {
    timer = null
    if (disposed) return
    // Virou background entre o agendamento e o disparo: guarda pra depois em vez
    // de gastar um fetch que o usuário nem vê.
    if (isHidden()) { pending = true; return }
    pending = false
    opts.onRefresh()
  }

  return {
    request: () => {
      if (disposed) return
      if (isHidden()) { pending = true; clear(); return }
      clear()
      timer = setTimeout(fire, delayMs)
    },
    flushOnVisible: () => {
      if (disposed || !pending) return
      pending = false
      clear()
      opts.onRefresh()
    },
    dispose: () => {
      disposed = true
      pending = false
      clear()
    },
  }
}
