/**
 * @module gymPermissionOutcome
 *
 * O que fazer com o status de localização que o iOS devolveu ao capturar a
 * academia do Auto Check-in.
 *
 * Existe por causa de um travamento reproduzido no aparelho em 22/08/2026: o
 * botão ficava em "Capturando..." PARA SEMPRE. A causa está no plugin Swift —
 * `requestAlwaysLocationPermission` guarda a `CAPPluginCall` e só a resolve no
 * delegate de autorização; quando o usuário escolhe **"Permitir Durante o Uso
 * do App"**, o código pede o upgrade para "Sempre" e fica esperando um segundo
 * callback que o iOS **não manda** (o prompt de "Sempre" não é reapresentado
 * na hora). A promise nunca resolvia, o `finally` nunca rodava e o botão
 * morria aceso.
 *
 * Duas lições que viram regra aqui:
 *
 * 1. **Chamada nativa que depende de resposta do USUÁRIO precisa de teto.**
 *    Sem isso, um caminho que o iOS não fecha vira UI travada — e travada em
 *    silêncio, que é pior: nem erro, nem log, nem saída.
 * 2. **`authorizedWhenInUse` não é falha.** O geofence ainda registra e dispara
 *    com o app aberto (ver `useGymGeofence`), então a academia deve ser salva.
 *    O que não funciona é a promessa da tela — "mesmo com o app fechado" —, e
 *    isso precisa ser DITO, não escondido atrás de um sucesso silencioso.
 */

/** Status crus que o plugin devolve, mais o nosso `timeout`. */
export type GymPermissionStatus =
  | 'authorizedAlways'
  | 'authorizedWhenInUse'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'timeout'
  | 'unknown'
  | string

export interface GymPermissionOutcome {
  /** Segue capturando a localização e salvando a academia? */
  proceed: boolean
  /** Mensagem de erro (bloqueia o fluxo). Vazia quando `proceed`. */
  error: string
  /** Aviso: salvou, mas com alcance menor do que a tela promete. */
  warning: string
}

const ERRO_NEGADO =
  'Permissão de localização negada. Habilite "Sempre" em Ajustes para o check-in automático funcionar.'

const AVISO_SO_EM_USO =
  'Academia salva, mas o iOS liberou a localização só "Durante o Uso do App": o aviso de chegada vai funcionar apenas com o IronTracks aberto. Para funcionar com o app fechado, mude para "Sempre" em Ajustes › IronTracks › Localização.'

export function resolveGymPermissionOutcome(status: GymPermissionStatus): GymPermissionOutcome {
  switch (status) {
    case 'authorizedAlways':
      return { proceed: true, error: '', warning: '' }
    case 'denied':
    case 'restricted':
      return { proceed: false, error: ERRO_NEGADO, warning: '' }
    // `timeout` é o caso do travamento: o iOS não fechou o pedido de "Sempre".
    // Na prática o usuário está com "Durante o Uso" — seguir e avisar é melhor
    // que travar, e melhor que fingir que deu tudo certo.
    case 'authorizedWhenInUse':
    case 'timeout':
    case 'notDetermined':
    case 'unknown':
    default:
      return { proceed: true, error: '', warning: AVISO_SO_EM_USO }
  }
}
