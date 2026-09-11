/**
 * O que a voz do cardio fala, e quando — decisão pura, sem relógio nem áudio.
 *
 * ⚠️ **O tempo anunciado é o do EXERCÍCIO INTEIRO, somando os blocos** (pedido
 * do dono, e ele está certo). Um cardio de "5 min a 4 km/h, 10 min a 5, 15 min
 * a 6" contado por bloco faria a voz dizer "cinco minutos" duas vezes no mesmo
 * treino — uma no fim do primeiro bloco, outra no meio do segundo — e nunca
 * chegar a trinta. Quem está na esteira acompanha UM relógio, o da sessão; é
 * esse que a voz precisa narrar.
 *
 * O marco é derivado do total, nunca contado por acumulação: se o app ficou
 * congelado e o relógio pulou de 3 para 12 minutos, sai um anúncio ("dez
 * minutos"), não dois. `ultimoMarcoAnunciado` existe só para não repetir o mesmo
 * marco a cada tique.
 */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Intervalos oferecidos ao usuário. `0` = voz desligada. */
export const INTERVALOS_DE_VOZ_MIN = [0, 1, 2, 5, 10] as const

/**
 * Quanto tempo de cardio já está GRAVADO neste exercício (blocos concluídos).
 *
 * Só conta bloco com `done` — série que o motor apenas preencheu não é série
 * feita (`isLogDone` é a fonte única dessa regra no app, e a razão dela é a
 * mesma aqui: somar tempo não cumprido faria a voz mentir).
 */
export function segundosJaFeitos(blocos: readonly unknown[]): number {
  if (!Array.isArray(blocos)) return 0
  let total = 0
  for (const bruto of blocos) {
    if (!isObj(bruto)) continue
    if (bruto.done !== true) continue
    const s = Number(bruto.durationSeconds)
    if (Number.isFinite(s) && s > 0) total += s
  }
  return Math.round(total)
}

/**
 * O próximo marco a anunciar, em minutos — ou `null` se não há novidade.
 *
 * `intervaloMinutos <= 0` desliga a voz, e é o default.
 */
export function marcoDeVozMinutos(
  totalSegundos: number,
  intervaloMinutos: number,
  ultimoMarcoAnunciado: number,
): number | null {
  const total = Number(totalSegundos)
  const intervalo = Number(intervaloMinutos)
  const ultimo = Number(ultimoMarcoAnunciado)
  if (!Number.isFinite(total) || total <= 0) return null
  if (!Number.isFinite(intervalo) || intervalo <= 0) return null

  const minutos = Math.floor(total / 60)
  const marco = Math.floor(minutos / intervalo) * intervalo
  if (marco <= 0) return null
  if (Number.isFinite(ultimo) && marco <= ultimo) return null
  return marco
}

/**
 * Número para o sintetizador pt-BR.
 *
 * O separador decimal precisa ser VÍRGULA: com ponto, a voz brasileira lê
 * "4.5" como "quatro ponto cinco". E o inteiro sai sem casa nenhuma — "cinco
 * vírgula zero quilômetros por hora" é ruído no meio de uma passada.
 */
export function numeroFalado(valor: unknown): string {
  // ⚠️ `Number('')` é 0, não NaN: sem a saída antecipada, campo VAZIO viraria
  // "na intensidade 0" — a voz afirmando um valor que ninguém digitou. É a
  // mesma armadilha que já mordeu as recomendações do check-in.
  const bruto = String(valor ?? '').trim()
  if (!bruto) return ''
  const n = Number(bruto.replace(',', '.'))
  if (!Number.isFinite(n)) return ''
  const arredondado = Math.round(n * 10) / 10
  return Number.isInteger(arredondado) ? String(arredondado) : String(arredondado).replace('.', ',')
}

/** "15 minutos" — curto de propósito: quem ouve está no meio de uma passada. */
export function fraseDoMarco(minutos: number): string {
  const m = Math.round(Number(minutos))
  if (!Number.isFinite(m) || m <= 0) return ''
  return m === 1 ? '1 minuto' : `${m} minutos`
}

export interface BlocoAnunciado {
  /** 1-based: o que o usuário vê no card. */
  numero: number
  /** Duração planejada do bloco, em segundos. */
  duracaoSegundos: number
  /** Velocidade declarada, se houver. */
  velocidade?: unknown
  /** Esteira fala "quilômetros por hora"; bike e afins falam "intensidade". */
  unidadeEhKmH?: boolean
}

/**
 * "Bloco 2. 10 minutos a 5 quilômetros por hora."
 *
 * É o anúncio que paga o encadeamento automático: sem ele, o bloco troca
 * sozinho e a pessoa descobre olhando a tela — que é justamente o que a feature
 * existe para evitar.
 */
export function fraseDoBloco(bloco: BlocoAnunciado): string {
  const numero = Math.round(Number(bloco?.numero))
  if (!Number.isFinite(numero) || numero <= 0) return ''
  const partes: string[] = [`Bloco ${numero}.`]

  const seg = Number(bloco?.duracaoSegundos)
  if (Number.isFinite(seg) && seg > 0) {
    const min = Math.round((seg / 60) * 10) / 10
    partes.push(`${numeroFalado(min)} ${min === 1 ? 'minuto' : 'minutos'}`)
  }

  const vel = numeroFalado(bloco?.velocidade)
  if (vel) {
    partes.push(bloco?.unidadeEhKmH ? `a ${vel} quilômetros por hora` : `na intensidade ${vel}`)
  }

  return `${partes.join(' ').trim()}.`.replace(/\.\s*\./g, '.')
}
