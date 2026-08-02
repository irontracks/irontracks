'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { parseTrainingNumber } from '@/utils/trainingNumber'

type BaseInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode'
>

export type NumericInputProps = BaseInputProps & {
  /** Valor numérico vindo do estado do pai (aceita número, string ou null/undefined). */
  value: number | string | null | undefined
  /** Chamado com o número parseado (aceita vírgula) ou null quando o campo fica vazio. */
  onValueChange: (value: number | null) => void
  /** true (default) = aceita decimais (teclado decimal); false = inteiro (teclado numérico). */
  decimal?: boolean
  /** Permite sinal negativo (default false). */
  allowNegative?: boolean
}

const toText = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '' : String(v)

/**
 * Input numérico que ACEITA vírgula como separador decimal (pt-BR).
 *
 * Por que existe: `<input type="number">` num WebView com locale != pt-BR REJEITA a
 * vírgula — o usuário só conseguia digitar número redondo (bug reportado no check-in de
 * peso, IMG_0059; também mordia carga/RPE/macros/valores em R$). Pior: guardar o valor
 * como Number no estado faz a vírgula "não grudar" enquanto digita ("95," vira 95 e some).
 *
 * Aqui mantemos um espelho string local: o que o usuário digita fica intacto na tela, e só
 * o número normalizado (95,5 -> 95.5) sobe pro pai via onValueChange. Um `<input>` de
 * `type="text"` + `inputMode` mostra o teclado certo sem o filtro do navegador.
 */
export function NumericInput({
  value,
  onValueChange,
  decimal = true,
  allowNegative = false,
  onFocus,
  onBlur,
  ...rest
}: NumericInputProps) {
  const [text, setText] = useState<string>(() => toText(value))
  const focusedRef = useRef(false)

  // Sincroniza do pai quando o valor externo muda pra um número diferente do que está no
  // campo (reset de form, preenchimento automático, edição de outro item). Não mexe
  // enquanto o campo tem foco — senão atropela a digitação de "95,".
  useEffect(() => {
    if (focusedRef.current) return
    const incoming = typeof value === 'number' ? value : parseTrainingNumber(value)
    const current = parseTrainingNumber(text)
    if (incoming !== current) setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const allow = allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g
      let cleaned = e.target.value.replace(allow, '')
      if (!decimal) cleaned = cleaned.replace(/[.,]/g, '')
      setText(cleaned)
      const empty = cleaned.trim() === '' || cleaned === '-'
      onValueChange(empty ? null : parseTrainingNumber(cleaned))
    },
    [decimal, allowNegative, onValueChange],
  )

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onChange={handleChange}
      onFocus={(e) => {
        focusedRef.current = true
        onFocus?.(e)
      }}
      onBlur={(e) => {
        focusedRef.current = false
        onBlur?.(e)
      }}
    />
  )
}
