import { useEffect, useRef } from 'react'
import { pushBackHandler, popBackHandler } from '@/lib/native/backButton'

/**
 * Registra um handler do botão Voltar nativo do Android enquanto `active` for true.
 *
 * Uso típico em overlays/modais:
 *   useBackHandler(isOpen, onClose)
 *
 * Enquanto o overlay está aberto, o Voltar nativo o FECHA em vez de minimizar o app.
 * LIFO: se vários overlays estão abertos, o mais recente fecha primeiro. O handler
 * pode mudar a cada render sem re-registrar (guardado em ref); só o toggle de `active`
 * registra/desregistra. No-op fora de Android nativo. Auditoria UX/UI M11.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!active) return
    const id = pushBackHandler(() => ref.current())
    return () => popBackHandler(id)
  }, [active])
}
