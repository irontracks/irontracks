/**
 * Quantas conclusões existem no mapa de logs do treino.
 *
 * Conta a série concluída (`done`) e também cada LADO concluído do unilateral
 * (`L_done`/`R_done`): tocar em "Concluir" num lado é o mesmo gesto de estar
 * treinando, e é ele que deve tirar o treino da pausa. Série desmarcada faz o
 * número CAIR, e cair não retoma nada — só subir.
 */
export function contarConclusoes(logs: unknown): number {
  if (!logs || typeof logs !== 'object') return 0;
  let n = 0;
  for (const valor of Object.values(logs as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object') continue;
    const log = valor as Record<string, unknown>;
    if (log.done === true) n++;
    if (log.L_done === true) n++;
    if (log.R_done === true) n++;
  }
  return n;
}
