'use client'

/**
 * O que uma tela de erro mostra ao usuário — e o que ela NÃO mostra.
 *
 * Oito das dez telas de erro do app despejavam a exceção crua num bloco
 * `font-mono` vermelho: "TypeError: Cannot read properties of undefined
 * (reading 'map')". Para o atleta na academia isso não é informação, é
 * ansiedade — ele não pode fazer nada com aquilo, e o texto ainda pode carregar
 * nomes internos e trechos de payload.
 *
 * O `digest` do Next existe exatamente para este lugar: é um identificador
 * OPACO e estável do erro, que o suporte cruza com o log. O usuário copia seis
 * caracteres; a stack fica onde tem uso, no Sentry.
 *
 * Sem digest (erro do cliente que o Next não registrou) o componente não
 * desenha nada: um rótulo vazio, ou um "—", só ocuparia espaço prometendo
 * ajuda que não existe.
 */
export function CodigoDoErro({ digest }: { digest?: string }) {
  const codigo = String(digest || '').trim()
  if (!codigo) return null
  return (
    <p className="mb-6 text-[11px] text-neutral-400">
      Código para o suporte: <span className="font-mono text-neutral-300">{codigo}</span>
    </p>
  )
}
