import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/**
 * Handler do botão Voltar nativo do Android (Capacitor) — auditoria UX/UI M11.
 *
 * Mantém uma pilha (LIFO) de handlers de overlay. Quando o usuário toca no Voltar
 * nativo no Android:
 *   1. Se há overlay registrado (modal/sheet aberto) → fecha o do TOPO (não navega).
 *   2. Senão, se o webview tem histórico → history.back() (navegação de views).
 *   3. Senão → minimiza o app (App.exitApp, que no Android manda pro background).
 *
 * Safe-by-construction: só intercepta o Voltar quando há um overlay REGISTRADO.
 * Overlays que ainda não usam useBackHandler() seguem o comportamento atual (sem
 * regressão). No-op fora de Android nativo (iOS/web não têm botão Voltar de sistema).
 */
type BackHandler = () => void

let stack: { id: number; handler: BackHandler }[] = []
let counter = 0
let initialized = false

export function pushBackHandler(handler: BackHandler): number {
  const id = ++counter
  stack.push({ id, handler })
  return id
}

export function popBackHandler(id: number): void {
  stack = stack.filter((h) => h.id !== id)
}

export async function initAndroidBackButton(): Promise<void> {
  if (initialized) return
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  initialized = true
  await App.addListener('backButton', ({ canGoBack }) => {
    const top = stack[stack.length - 1]
    if (top) {
      try { top.handler() } catch { /* overlay handler nunca deve estourar o app */ }
      return
    }
    if (canGoBack) {
      window.history.back()
    } else {
      // Sem overlay e sem histórico → manda o app pro background (não fecha de vez).
      App.exitApp()
    }
  })
}
