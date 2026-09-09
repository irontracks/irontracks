/**
 * @module volumeVariation
 *
 * Classifica a variação de volume entre uma sessão e a anterior.
 *
 * ## Por que existe
 * O card "Volume vs anterior" pintava de VERMELHO-ALARME qualquer valor
 * negativo, sem piso. Visto no relatório real em 11/08/2026: uma sessão com
 * **2 PRs alcançados** exibia, ao lado, um bloco vermelho com "−209 kg /
 * −0,8%". Oito décimos de por cento.
 *
 * Pior: a MESMA tela, alguns blocos abaixo, mostrava "Variação semanal −30,9%"
 * em cinza, com o rótulo "semana normal". Dois julgamentos contraditórios do
 * mesmo tipo de grandeza — uma queda 38× maior tratada como normal, e a menor
 * como emergência.
 *
 * ## De onde vem o limiar
 * Variação de volume entre sessões do mesmo treino tem ruído estrutural: peso
 * arredondado para o que é montável, uma repetição a mais ou a menos, ordem dos
 * exercícios. Uma única rep extra num exercício de 100 kg move 100 kg — em uma
 * sessão de 25.000 kg, isso é 0,4%. Somando dois ou três desses, chega-se
 * facilmente a 2%.
 *
 * `LIMIAR_RUIDO_PCT = 3` cobre esse ruído sem esconder queda real: −10%, −20%
 * continuam vermelhos, como devem.
 *
 * A régua é DELIBERADAMENTE simétrica. Um ganho de 0,5% também não é vitória —
 * pintar de verde ensina o usuário a comemorar ruído, que é a mesma distorção
 * na direção oposta.
 */

/** Abaixo disto, em módulo, a diferença é ruído de medição — não tendência. */
export const LIMIAR_RUIDO_PCT = 3

export type VariacaoVolume = 'alta' | 'estavel' | 'queda' | 'descarga'

/**
 * @param pct variação percentual (ex.: -0.8 para queda de 0,8%)
 * @param emDeload a sessão aplicou descarga? (`lib/workout/checkinRecommendations`)
 *
 * ⚠️ **Queda em sessão de DESCARGA não é queda — é o plano dando certo.**
 * Relato do dono em 09/09/2026, com print: treino inteiro em deload exibindo
 * "−7.016 kg / −24,2%" em VERMELHO, ao lado de um PR alcançado. O app pintou de
 * alarme exatamente o resultado que ele mandou o app produzir.
 *
 * É a mesma classe do defeito que criou este módulo (vermelho para −0,8%), e
 * por isso a correção mora aqui e não numa exceção na tela: o julgamento sobre
 * a variação é DESTE arquivo. Alta em descarga continua sendo alta — subir
 * volume numa semana de descarga é informação real, e escondê-la seria mentir
 * na direção oposta.
 */
export function classificarVariacaoVolume(pct: number, emDeload = false): VariacaoVolume {
  if (!Number.isFinite(pct)) return 'estavel'
  if (pct >= LIMIAR_RUIDO_PCT) return 'alta'
  if (pct <= -LIMIAR_RUIDO_PCT) return emDeload ? 'descarga' : 'queda'
  return 'estavel'
}

/** Rótulo curto para o card. `estavel` não usa sinal: não há o que celebrar nem temer. */
export function rotuloVariacaoVolume(classe: VariacaoVolume): string {
  if (classe === 'alta') return 'acima da anterior'
  if (classe === 'queda') return 'abaixo da anterior'
  // Diz a CAUSA, não só o sentido: "abaixo da anterior" numa descarga é
  // verdade e ainda assim engana, porque omite que a queda foi pedida.
  if (classe === 'descarga') return 'descarga planejada'
  return 'em linha com a anterior'
}
