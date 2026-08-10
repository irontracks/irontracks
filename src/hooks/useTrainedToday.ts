'use client'

/**
 * `useTrainedToday` — resposta reativa de "já treinou hoje?" para o dashboard.
 *
 * Retorna `null` enquanto não sabe. Quem consome deve tratar o desconhecido como
 * "ainda não treinou": esconder a ação primária durante a consulta deixaria a
 * primeira dobra vazia em toda abertura do app, o que é pior que mostrá-la por
 * um instante a quem já treinou.
 *
 * A leitura é refeita quando `revalidateKey` muda — é assim que o card volta a
 * perguntar depois que uma sessão termina.
 */
import { useEffect, useState } from 'react'
import { hasTrainedTodayBrt } from '@/lib/workout/trainedToday'

export function useTrainedToday(userId?: string, revalidateKey?: unknown): boolean | null {
  const [treinou, setTreinou] = useState<boolean | null>(null)

  useEffect(() => {
    const uid = String(userId || '').trim()
    let cancelado = false
    void (async () => {
      // Sem usuário a resposta volta a ser "não sei" — quem consome trata isso
      // como "ainda não treinou", que é o comportamento seguro.
      const r = uid ? await hasTrainedTodayBrt(uid) : null
      if (!cancelado) setTreinou(r)
    })()
    return () => { cancelado = true }
  }, [userId, revalidateKey])

  return treinou
}
