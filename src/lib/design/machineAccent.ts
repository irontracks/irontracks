/**
 * VIOLETA — a cor do que a MÁQUINA decidiu. Fonte única.
 *
 * ## Por que uma quinta cor existe num app de uma cor só
 *
 * O IronTracks é dourado. O dourado é a cor da AÇÃO: iniciar, concluir, salvar.
 * Ele responde "o que eu faço agora". Mas o app passou a responder também uma
 * pergunta diferente — "de onde veio este número?" — e essa não é uma pergunta
 * de ação, é de PROCEDÊNCIA.
 *
 * Quando o motor de carga sugere 73 kg, o usuário precisa distinguir isso do
 * peso que ele mesmo digitou. Em dourado, sugestão e decisão ficariam
 * indistinguíveis; em cinza, a sugestão viraria texto secundário e ninguém
 * olharia. É informação que só a cor entrega na velocidade certa, porque ela é
 * lida de relance, com o braço tremendo, entre uma série e outra.
 *
 * ## Ela já existia — só não tinha nome
 *
 * Auditoria de 12/08/2026: 21 ocorrências de violeta/roxo em 9 arquivos. As do
 * usuário eram todas, sem exceção, saída de máquina — o card CARGA AUTOMÁTICA,
 * a nota "🧠 Última vez: 73 kg × 9", os campos de peso sugerido, o cartão de
 * ajuste de treino gerado pela avaliação por foto. Ninguém combinou isso; o
 * violeta virou a cor da máquina por convergência, em quatro superfícies
 * diferentes.
 *
 * O defeito nunca foi a cor. Era ela existir **de fato e não de direito**: sem
 * declaração, sem regra de uso, e por isso replicada à mão com valores
 * ligeiramente diferentes em cada arquivo — o mesmo caminho que já custou caro
 * nos macronutrientes (ver `lib/nutrition/macroColors`).
 *
 * ## A regra, em uma linha
 *
 * **Violeta = a máquina decidiu. Dourado = você decide.** Nada de violeta em
 * elemento que o usuário aciona; nada de dourado em valor que ele não escolheu.
 *
 * ## Contraste
 *
 * Os tons ficam em 200/300 e passam o mínimo AA sobre o fundo `#0a0a0a`
 * (`violet-300` = 11.6:1; `purple-300` = 11.0:1). Violeta escuro sobre preto é
 * ilegível na academia — não desça a escala sem medir.
 */

/** O matiz, para quem desenha (gráfico, sombra, gradiente). */
export const MACHINE_COLOR = '#8b5cf6'

/**
 * Classes por PAPEL. Cada entrada existe porque havia um uso real, escrito à
 * mão, em pelo menos um arquivo.
 */
export const MACHINE_ACCENT = {
  /** Texto de apoio: a nota do autoload, marcadores de lista sugerida. */
  text: 'text-violet-300',
  /** Texto sobre uma superfície já violeta (chip ligado, campo sugerido). */
  textOnSurface: 'text-violet-100',
  /** Bloco em repouso: o card que anuncia que o motor está agindo. */
  surface: 'border-violet-400/20 bg-violet-500/[0.07]',
  /** Bloco em destaque: o mesmo card com o motor LIGADO. */
  surfaceActive: 'border-violet-400/25 bg-violet-500/15 text-violet-200',
  /** Campo cujo valor veio do motor — a borda diz "não fui eu que pus isto". */
  field: 'border-violet-500/60 ring-violet-500 text-violet-100 bg-violet-500/5',
  /** Controle ligado (o pino do toggle da carga automática). */
  toggleOn: 'bg-violet-500 border-violet-400/40 shadow-[0_0_12px_rgba(139,92,246,0.35)]',
  /** Ícone que marca um bloco inteiro como saída de máquina. */
  icon: 'text-violet-300',
  /** Régua lateral que marca um bloco de texto como saída de máquina. */
  rule: 'border-violet-400/30',
  /** Alvo escolhível dentro de um bloco de máquina — a borda acende no toque. */
  hoverBorder: 'hover:border-violet-400/40',
} as const

export type MachineAccentRole = keyof typeof MACHINE_ACCENT
