'use client'

/**
 * As marcas de "registro incompleto" do usuário (`nutrition_day_flags`).
 *
 * Marcar é INSERT, desmarcar é DELETE — a tabela não tem UPDATE de propósito.
 *
 * A escrita é OTIMISTA: o toque muda a lista na hora e a média se ajusta no
 * mesmo frame. Esperar o servidor para redesenhar deixaria o número piscando
 * meio segundo depois do toque, e o usuário toca de novo achando que falhou.
 * Se o banco recusar, a marca volta atrás e o erro aparece — nunca fica uma
 * média baseada em algo que não foi gravado.
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type Estado = {
  /**
   * Carimbo da consulta que produziu este resultado. Trocar de intervalo
   * invalida o estado no próprio render, sem um `setEstado` SÍNCRONO dentro do
   * efeito — que o ESLint deste repo reprova (`react-hooks/set-state-in-effect`)
   * e que dispararia render em cascata. Mesmo padrão do modal do histórico.
   */
  chave: string
  /** Datas marcadas, `YYYY-MM-DD`. */
  marcados: ReadonlySet<string>
  erro: string
}

const VAZIO: ReadonlySet<string> = new Set<string>()

export function useNutritionDayFlags(userId: string | undefined, inicio: string | null, fim: string | null) {
  const chave = `${String(userId || '')}|${inicio ?? ''}|${fim ?? ''}`
  const [estado, setEstado] = useState<Estado>({ chave: '', marcados: VAZIO, erro: '' })
  // Resultado de OUTRO intervalo não vale para este: enquanto o novo não
  // chega, a lista está vazia em vez de mostrar as marcas do período anterior.
  const atual = estado.chave === chave ? estado : null

  useEffect(() => {
    const uid = String(userId || '').trim()
    if (!uid || !inicio || !fim) return
    let cancelado = false

    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('nutrition_day_flags')
          .select('date')
          .eq('user_id', uid)
          .gte('date', inicio)
          .lte('date', fim)
        if (cancelado) return
        // O supabase-js entrega a falha no RETORNO. Sem este ramo, erro de
        // leitura viraria "nenhum dia marcado" — e a média voltaria a incluir
        // os dias que o usuário já tinha excluído, sem avisar ninguém.
        if (error) { setEstado({ chave, marcados: VAZIO, erro: 'Não consegui ler os dias marcados.' }); return }
        const set = new Set<string>((data ?? []).map((r) => String((r as { date?: unknown }).date ?? '').slice(0, 10)).filter(Boolean))
        setEstado({ chave, marcados: set, erro: '' })
      } catch {
        if (!cancelado) setEstado({ chave, marcados: VAZIO, erro: 'Não consegui ler os dias marcados.' })
      }
    })()

    return () => { cancelado = true }
    // `chave` cobre userId+intervalo; os três estão nas deps por clareza.
  }, [userId, inicio, fim, chave])

  const marcados = atual?.marcados ?? VAZIO

  const alternar = useCallback(async (date: string, marcar: boolean) => {
    const uid = String(userId || '').trim()
    if (!uid || !date) return
    const anterior = marcados

    const otimista = new Set(anterior)
    if (marcar) otimista.add(date); else otimista.delete(date)
    setEstado({ chave, marcados: otimista, erro: '' })

    try {
      const supabase = createClient()
      const { error } = marcar
        ? await supabase.from('nutrition_day_flags').insert({ user_id: uid, date, reason: 'incomplete' })
        : await supabase.from('nutrition_day_flags').delete().eq('user_id', uid).eq('date', date)
      // Falha de escrita DESFAZ a marca otimista: nunca pode sobrar uma média
      // calculada sobre algo que o banco recusou.
      if (error) setEstado({ chave, marcados: anterior, erro: 'Não consegui salvar. Tente de novo.' })
    } catch {
      setEstado({ chave, marcados: anterior, erro: 'Não consegui salvar. Tente de novo.' })
    }
  }, [userId, marcados, chave])

  return { marcados, erro: atual?.erro ?? '', alternar }
}
