'use client'

/**
 * `useDayChangeTick` — um contador que anda quando o DIA vira.
 *
 * Existe porque o app fica aberto (e no iOS, em background) por dias: o que
 * decide "é dia de treino?" é lido no render, e sem um empurrão nada
 * reavaliaria na virada da meia-noite. O card do topo ficaria mostrando a
 * resposta de ontem até o usuário mexer em alguma coisa.
 *
 * São dois gatilhos porque um só não basta: o timer cobre o app aberto na
 * virada, e o `visibilitychange` cobre o aparelho que passou a noite com a tela
 * apagada — o iOS suspende o timer do WebView e ele acorda atrasado.
 */
import { useEffect, useRef, useState } from 'react'

/** Dia local (YYYY-MM-DD) — o mesmo fuso que `isWorkoutToday` usa. */
function chaveDiaLocal(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function msAteAProximaMeiaNoite(now: Date = new Date()): number {
  const proxima = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return Math.max(1000, proxima.getTime() - now.getTime())
}

export function useDayChangeTick(): number {
  const [tick, setTick] = useState(0)
  const diaRef = useRef(chaveDiaLocal())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const conferir = () => {
      const hoje = chaveDiaLocal()
      if (hoje === diaRef.current) return
      diaRef.current = hoje
      setTick((t) => t + 1)
    }

    const agendar = () => {
      if (timer) clearTimeout(timer)
      // +1s de folga: acordar em 00:00.000 cravado já leu o dia anterior em
      // aparelho com o relógio arredondando para trás.
      timer = setTimeout(() => { conferir(); agendar() }, msAteAProximaMeiaNoite() + 1000)
    }

    const aoVoltar = () => { conferir(); agendar() }

    agendar()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      if (timer) clearTimeout(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  return tick
}
