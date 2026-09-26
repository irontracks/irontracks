/**
 * Qual etapa de "Como funciona" está no meio da tela.
 *
 * Progresso da linha central da tela sobre a coluna de etapas: 0 quando o topo
 * da coluna cruza o centro, 1 quando o fim cruza. Dividido em partes iguais —
 * as etapas têm a mesma altura mínima (85svh).
 *
 * Função pura de propósito: as duas tentativas anteriores (visibilidade por
 * etapa e `useScroll` do Motion) falharam em silêncio no navegador e deixavam o
 * vídeo fixo preso na primeira etapa. Aqui a regra é testável sem layout.
 */
export function etapaAtiva(topoColuna: number, alturaColuna: number, alturaTela: number, total: number): number {
  if (total <= 1) return 0
  const progresso = (alturaTela / 2 - topoColuna) / Math.max(1, alturaColuna)
  return Math.min(total - 1, Math.max(0, Math.floor(progresso * total)))
}
