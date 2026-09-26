/** Curva de saída da landing: começa rápida e pousa devagar. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** Entrada padrão de bloco ao aparecer na rolagem. */
export const surgir = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.8, ease: EASE_OUT },
} as const
