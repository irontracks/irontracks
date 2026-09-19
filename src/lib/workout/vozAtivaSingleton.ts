/**
 * @module vozAtivaSingleton
 *
 * Trava de "só um ditado por vez" — o botão de voz vive no card do
 * EXERCÍCIO, e a lista de treino tem um `VoiceExerciseButton` por exercício
 * (cada um com sua própria instância de `useSpeechToText`). Sem isto, tocar
 * no microfone de um exercício e depois no de outro — sem lembrar de parar o
 * primeiro — faria dois reconhecedores de voz disputarem o mesmo microfone
 * nativo. Risco previsto em `docs/plans/voz-na-serie.md` §5.3.
 *
 * `criarCoordenadorDeVozUnica` é uma FACTORY (não um módulo com estado
 * solto) para os testes poderem instanciar o próprio coordenador em vez de
 * compartilhar estado global entre casos. `coordenadorDeVozUnica` é a
 * instância que o app de fato usa.
 */

export interface CoordenadorDeVozUnica {
  /** Uma nova gravação começou; para a anterior, se houver uma diferente. */
  iniciar: (parar: () => void) => void
  /** Esta gravação terminou (por qualquer motivo) — libera a trava. */
  finalizar: () => void
}

export function criarCoordenadorDeVozUnica(): CoordenadorDeVozUnica {
  let pararAtual: (() => void) | null = null

  return {
    iniciar(parar) {
      const anterior = pararAtual
      pararAtual = parar
      if (anterior && anterior !== parar) {
        try { anterior() } catch { /* best effort — a instância antiga já está indo embora */ }
      }
    },
    finalizar() {
      pararAtual = null
    },
  }
}

export const coordenadorDeVozUnica = criarCoordenadorDeVozUnica()
