'use client'

/**
 * As refeições de um dia, buscadas SOB DEMANDA quando o card é aberto.
 *
 * Por que sob demanda, e não junto com a lista: o histórico de 90 dias já traz
 * uma linha por dia; puxar todas as refeições de todos eles de antemão seria
 * multiplicar o payload por 5 para mostrar o que, na prática, o usuário abre em
 * um ou dois dias. É a mesma lição do `slimHistoryRow` — a rota resume, o
 * detalhe vem quando alguém pede.
 *
 * O que já foi buscado fica em cache por dia: fechar e reabrir o card não gera
 * consulta nova. Cache de LEITURA e de vida curta (morre com o modal), então
 * não há a segunda fonte de verdade que este repo evita.
 */
import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { normalizeMealRows, type NutritionMeal, type NutritionMealRow } from '@/lib/nutrition/dayMeals'

export type EstadoDoDia =
  | { status: 'fechado' }
  | { status: 'carregando' }
  | { status: 'ok'; refeicoes: NutritionMeal[] }
  | { status: 'erro'; mensagem: string }

const FECHADO: EstadoDoDia = { status: 'fechado' }

/** As colunas do detalhe. `items` traz os alimentos que o parser já separou. */
export const COLUNAS_REFEICAO = 'id, date, created_at, food_name, calories, protein, carbs, fat, items'

export function useNutritionDayMeals(userId: string | undefined) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set<string>())
  const [cache, setCache] = useState<ReadonlyMap<string, NutritionMeal[]>>(new Map())
  const [carregando, setCarregando] = useState<ReadonlySet<string>>(new Set<string>())
  const [erros, setErros] = useState<ReadonlyMap<string, string>>(new Map())

  const buscar = useCallback(async (date: string) => {
    const uid = String(userId || '').trim()
    if (!uid) return
    setCarregando((prev) => new Set(prev).add(date))
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('nutrition_meal_entries')
        .select(COLUNAS_REFEICAO)
        .eq('user_id', uid)
        .eq('date', date)
      // O supabase-js entrega a falha no RETORNO, não como exceção. Sem este
      // ramo, erro de leitura viraria "nenhuma refeição neste dia" — uma
      // afirmação falsa sobre o dia da pessoa, no lugar de um aviso.
      if (error) {
        setErros((prev) => new Map(prev).set(date, 'Não consegui carregar as refeições deste dia.'))
        return
      }
      setCache((prev) => new Map(prev).set(date, normalizeMealRows((data ?? []) as NutritionMealRow[])))
      setErros((prev) => {
        if (!prev.has(date)) return prev
        const next = new Map(prev)
        next.delete(date)
        return next
      })
    } catch {
      setErros((prev) => new Map(prev).set(date, 'Não consegui carregar as refeições deste dia.'))
    } finally {
      setCarregando((prev) => {
        const next = new Set(prev)
        next.delete(date)
        return next
      })
    }
  }, [userId])

  /** Abre ou fecha o card. Abrir busca só na primeira vez. */
  const alternar = useCallback((date: string) => {
    const vaiAbrir = !abertos.has(date)
    setAbertos((prev) => {
      const next = new Set(prev)
      if (vaiAbrir) next.add(date)
      else next.delete(date)
      return next
    })
    // Fechar e reabrir não gera consulta nova: o dia já está no cache.
    if (vaiAbrir && !cache.has(date) && !carregando.has(date)) void buscar(date)
  }, [abertos, cache, carregando, buscar])

  const estadoDe = useCallback((date: string): EstadoDoDia => {
    if (!abertos.has(date)) return FECHADO
    const erro = erros.get(date)
    if (erro) return { status: 'erro', mensagem: erro }
    const refeicoes = cache.get(date)
    if (refeicoes) return { status: 'ok', refeicoes }
    return { status: 'carregando' }
  }, [abertos, cache, erros])

  return { alternar, estadoDe, estaAberto: useCallback((d: string) => abertos.has(d), [abertos]) }
}
