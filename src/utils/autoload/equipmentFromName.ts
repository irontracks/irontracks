/**
 * inferEquipmentFromName — infere o equipamento a partir do NOME do exercício.
 *
 * O exercício dentro do treino ativo não carrega `equipment` (só o exercise_library
 * tem). Buscar a lib no client seria uma camada de fetch a mais; como os nomes em
 * pt-BR quase sempre trazem o equipamento ("Supino reto com halteres", "Chest press
 * (máquina)", "Crossover no cabo"), inferir do nome resolve a maioria SEM infra.
 *
 * Devolve slugs no vocabulário do plateMath. Sem match → [] (plateMath cai no default
 * 2,5 kg, load-bearing) — fallback seguro. É um heurístico degradável de propósito;
 * pode ser trocado por lookup real do exercise_library depois sem mudar o consumidor.
 */

const norm = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas combinantes)
    .toLowerCase()

/** Regras ordenadas: a PRIMEIRA categoria que casar define o slug retornado. A ordem
 *  importa — "barra fixa" (peso corporal) tem que vir antes de "barra". */
const RULES: Array<{ slug: string; patterns: RegExp }> = [
  { slug: 'elastico', patterns: /\belastic|\bmini ?band|\bband\b/ },
  {
    slug: 'peso_corporal',
    patterns:
      /barra fixa|\bpull ?up|\bpullup|\bmuscle ?up|paralel|\bdips?\b|mergulho|flex[ao]{1,2}\b|flexao|prancha|\bpeso corporal|\bcorporal|australian|austral/,
  },
  { slug: 'smith', patterns: /\bsmith\b/ },
  { slug: 'halteres', patterns: /halter|\bdumbbell|\bdb\b|\bhalteres\b/ },
  { slug: 'cabo', patterns: /\bcabo\b|\bpolia|crossover|cross ?over|\bpulley|puxad|pull ?down|pulldown|\bcorda\b/ },
  {
    slug: 'maquina',
    patterns:
      /\bmaquina|\bmachine\b|pec ?k? ?deck|leg ?press|\bhack\b|chest ?press|voador|graviton|extensora|flexora|adutora|abdutora|\bpanturrilha (sentad|em pe|na maquina)|cadeira|mesa flexora/,
  },
  { slug: 'barra_trap', patterns: /barra ?trap|trap ?bar/ },
  { slug: 'barra', patterns: /\bbarra\b(?! ?fix)|\bbarbell/ },
]

/**
 * Exercícios feitos com BARRA por convenção, cujo nome em pt-BR não traz a palavra
 * "barra": "Agachamento livre", "Terra convencional", "Supino declinado", "Remada alta".
 * Confirmado no catálogo real (exercise_library): 16 entradas com equipment=['barra']
 * não citam "barra" no nome — ou seja, a regra literal acima falhava justamente nos
 * exercícios de barra mais comuns.
 *
 * Só entra em ação quando NENHUM outro equipamento casou (ver abaixo): "Supino na
 * máquina" e "Remada baixa no cabo" precisam continuar máquina/cabo, e o plateMath
 * prioriza barbell sobre eles — inferir barra em paralelo inverteria a classificação.
 *
 * Padrões deliberadamente ESTREITOS onde o nome é ambíguo: só "remada curvada/alta/
 * cavalinho" (não "remada" solta, que pega serrote/unilateral, tipicamente halter) e
 * só "rosca direta/inversa/21" (não "rosca" solta, que pega martelo/Scott/concentrada).
 * `bulgaro` é excluído do agachamento — é exercício de halteres.
 */
const IMPLICIT_BARBELL =
  /\bsupino\b|\bagachamento\b(?!.*bulgaro)|\bterra\b|remada (curvada|alta|cavalinho)|good ?morning|power ?clean|\barranco\b|desenvolvimento militar|rosca (direta|inversa|21)\b/

/**
 * Infere os slugs de equipamento do nome. Pode devolver mais de um (ex.: um nome
 * que cite "barra" e "banco") — o plateMath resolve a prioridade. Sem match → [].
 */
export function inferEquipmentFromName(name: string | null | undefined): string[] {
  const n = norm(name ?? '')
  if (!n.trim()) return []
  const slugs: string[] = []
  for (const rule of RULES) {
    if (rule.patterns.test(n)) slugs.push(rule.slug)
  }
  // Fallback: nome sem NENHUM equipamento explícito, mas que é de barra por convenção.
  // Não altera o motor de carga — `barbell` e `default` têm o mesmo incremento (2,5 kg)
  // e ambos são load-bearing; o que muda é a classe, que a UI usa para decidir o que
  // faz sentido mostrar (ex.: calculadora de anilhas só existe em barra).
  if (slugs.length === 0 && IMPLICIT_BARBELL.test(n)) slugs.push('barra')
  return slugs
}
