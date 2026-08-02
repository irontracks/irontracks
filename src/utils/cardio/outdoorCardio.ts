/**
 * Heurística pt-BR: este cardio é feito ao ar livre (faz sentido rastrear por GPS)
 * ou numa máquina parada (GPS não anda, então não faz sentido)?
 *
 * Usado pelo treino ativo para decidir se o painel de GPS merece o topo da tela.
 * Antes ele aparecia em 100% dos treinos — inclusive num treino de peito, onde
 * ninguém vai correr — roubando o primeiro card do exercício da vez.
 *
 * Conservador de propósito: nome desconhecido ("Cardio", "Aeróbico") devolve
 * `false`. O usuário nunca perde o acesso — o painel continua a um toque pelo
 * botão dentro do card de cardio e pelo menu do header.
 */

const normalize = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Máquina parada — checado ANTES do outdoor, porque "bike ergométrica" e
// "simulador de caminhada" contêm palavras da lista de outdoor.
const INDOOR_PATTERNS = [
  /\besteira\b/,
  /\btreadmill\b/,
  /\bergometric[ao]\b/,
  /\bergometro\b/,
  /\beliptic[ao]\b/,
  /\btransport\b/,
  /\bescada\b/,
  /\bstair/,
  /\bremo\b/,
  /\browing\b/,
  /\bspinning\b/,
  /\bsimulador\b/,
  /\bestacionari[ao]\b/,
  /\bindoor\b/,
];

// Deslocamento real no espaço — o GPS tem o que medir.
const OUTDOOR_PATTERNS = [
  /\bcorrida\b/,
  /\bcorrer\b/,
  /\bcaminhada\b/,
  /\bcaminhar\b/,
  /\btrote\b/,
  /\btrilha\b/,
  /\bciclismo\b/,
  /\bpedal\b/,
  /\bpedalada\b/,
  /\bbike\b/,
  /\bbicicleta\b/,
  /\brua\b/,
  /\boutdoor\b/,
  /\brun\b/,
  /\brunning\b/,
  /\bwalk\b/,
  /\bwalking\b/,
];

/** `true` quando o nome indica máquina parada (esteira, ergométrica, elíptico…). */
export function isIndoorCardioName(name: unknown): boolean {
  const n = normalize(String(name ?? ''));
  if (!n) return false;
  return INDOOR_PATTERNS.some((re) => re.test(n));
}

/** `true` só quando o nome indica deslocamento ao ar livre. */
export function isOutdoorCardioName(name: unknown): boolean {
  const n = normalize(String(name ?? ''));
  if (!n) return false;
  if (INDOOR_PATTERNS.some((re) => re.test(n))) return false;
  return OUTDOOR_PATTERNS.some((re) => re.test(n));
}

/**
 * O painel de cardio GPS deve ocupar o topo do treino ativo?
 *
 * INVARIANTE CRÍTICO: `recoveredRun` (corrida persistida no IDB, sobrevivente de
 * um app morto no meio) e `openedManually` SEMPRE mandam o painel pra tela. Ele
 * é o único dono do tracking em curso — escondê-lo com corrida viva deixaria a
 * sessão sem porta de entrada e o usuário perderia o percurso.
 */
export function shouldShowCardioPanel(input: {
  workoutHasOutdoorCardio: boolean;
  recoveredRun: boolean;
  openedManually: boolean;
}): boolean {
  return input.recoveredRun || input.openedManually || input.workoutHasOutdoorCardio;
}

/** O treino tem ao menos um exercício de cardio ao ar livre? */
export function hasOutdoorCardio(exercises: ReadonlyArray<unknown>): boolean {
  return exercises.some((ex) => {
    if (typeof ex !== 'object' || ex === null) return false;
    const rec = ex as Record<string, unknown>;
    const method = normalize(String(rec.method ?? ''));
    // Só considera exercícios marcados como cardio — um "supino" nunca vira GPS.
    if (method !== 'cardio') return false;
    return isOutdoorCardioName(rec.name);
  });
}
