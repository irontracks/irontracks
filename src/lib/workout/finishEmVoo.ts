/**
 * "O DELETE de `active_workout_sessions` que está chegando é o eco do MEU
 * finish" — o sinal que faltava para o app não sequestrar a própria navegação.
 *
 * ⚠️ O DEFEITO QUE ISTO CONSERTA (05/09/2026, medido no simulador e em
 * produção): depois de finalizar o treino o app ia para o DASHBOARD em vez do
 * relatório, de forma intermitente. Nenhum erro, nenhum log — o relatório
 * simplesmente não abria, e com ele sumia a celebração de fim de treino.
 *
 * A corrida, ponta a ponta:
 *
 *  1. `POST /api/workouts/finish` APAGA a linha de `active_workout_sessions`;
 *  2. de volta no cliente, `onFinish` passa pelo `triggerExit` do
 *     `ActiveWorkout`, que espera **280 ms** de animação de saída antes de
 *     chamar `setView('report')`;
 *  3. nesse meio-tempo o DELETE ecoa pelo Realtime. Como `view` ainda é
 *     `'active'`, o handler de `useSessionSync` fazia
 *     `setView(prev => prev === 'active' ? 'dashboard' : prev)`;
 *  4. o `ActiveWorkout` desmonta e seu cleanup **cancela o timer de saída** —
 *     então o `setView('report')` nunca roda.
 *
 * Quem chegasse primeiro decidia a tela, e é por isso que o sintoma ia e
 * voltava: às 05:11 o timer ganhou (o relatório abriu), às 05:38, 05:39 e
 * 05:43 o Realtime ganhou (dashboard).
 *
 * O discriminador que já existia no handler — `wasForeign =
 * !!activeSessionRef.current` — não resolve, e não é descuido: durante essa
 * janela a sessão local AINDA existe (quem a limpa é o callback atrasado), então
 * o eco do próprio aparelho se parece com um finish vindo de fora. Ele acertava
 * o caso de depois, não o de durante. A janela de 8 s de
 * `suppressForeignFinishToastUntilRef` também não alcança: ela é aberta DENTRO
 * do callback atrasado, ou seja, depois da corrida terminar.
 *
 * Por isso o sinal é marcado ANTES do POST: é o único instante que precede
 * tudo — a exclusão no servidor, o eco e a animação.
 *
 * Mora num módulo, e não numa ref costurada pelos hooks, porque as duas pontas
 * ficam a quatro camadas de distância (`useWorkoutFinish` → `ActiveWorkout` →
 * `useWorkoutCrud` → `useSessionSync`) e o dado é o mesmo para o aparelho
 * inteiro: existe UM treino ativo por vez.
 */

/**
 * Teto de segurança. A marca é apagada assim que a navegação para o relatório
 * commita (`useWorkoutCrud`), então isto só vale quando algo no caminho falha —
 * e um sinal preso para sempre calaria o aviso legítimo de "treino finalizado
 * em outro dispositivo". Folgado o bastante para o POST lento + os 280 ms da
 * animação + o commit da rota.
 */
export const JANELA_FINISH_EM_VOO_MS = 15_000

let marcadoEm = 0

/** Chamado logo antes do POST que apaga a sessão ativa no servidor. */
export const marcarFinishEmVoo = (agora: number = Date.now()): void => {
    marcadoEm = agora
}

/** Chamado quando a navegação do finish termina — ou ao começar um treino novo. */
export const limparFinishEmVoo = (): void => {
    marcadoEm = 0
}

/**
 * Há um finish DESTE aparelho em voo? Enquanto houver, o eco do DELETE não
 * decide navegação nem acusa "finalizado em outro dispositivo".
 */
export const finishEmVoo = (agora: number = Date.now()): boolean =>
    marcadoEm > 0 && agora - marcadoEm < JANELA_FINISH_EM_VOO_MS
