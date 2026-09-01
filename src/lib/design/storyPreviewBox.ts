/**
 * O tamanho da PRÉVIA nos quatro composers de story.
 *
 * ⚠️ Nasceu de um relato de usuário (Diogo, 01/09/2026): "não consigo mudar os
 * templates nem salvar a foto". Reproduzido no simulador em 390×844 pt — e não
 * havia nada quebrado no painel: ele simplesmente ficava INTEIRO abaixo da
 * dobra. Numa tela de 844 pt, cabeçalho + prévia (533 px de altura, pelo 9/16
 * de 300 px) + a barra de ferramentas consomem a tela toda, e o que sobra para
 * iniciar a rolagem é a faixa de ~60 px da própria barra.
 *
 * O que fecha a armadilha: a prévia tem overlay de gesto (`touch-none`) porque
 * arrastar move o card e a pinça dá zoom. Ou seja, o dedo que sobe pela prévia
 * — que é o gesto natural, já que ela ocupa quase tudo — NÃO rola a página:
 * arrasta o bloco do treino. O usuário conclui que a tela acabou ali.
 *
 * Por isso a largura passa a ser limitada pela ALTURA da viewport: com
 * `29svh`, a prévia (9/16) ocupa ~52svh e sobra espaço real para o seletor de
 * estilo aparecer na primeira dobra — a dobra deixa de mentir que a tela
 * terminou. Em telas altas e no desktop nada muda (o `min()` devolve os
 * 300/340 px de sempre).
 *
 * Vale para os QUATRO composers (treino, nutrição, cardio, métricas): eles
 * compartilham os sub-componentes justamente para não divergirem, e esta
 * medida estava copiada em cada um.
 */

/** Caixa da prévia 9/16 — largura limitada por px E pela altura da tela. */
export const STORY_PREVIEW_BOX = 'w-[min(300px,29svh)] sm:w-[min(340px,32svh)] lg:w-[340px]'

/** Mesma largura para as barras que acompanham a prévia (ferramentas, legenda). */
export const STORY_PREVIEW_ROW = 'w-[min(300px,29svh)] sm:w-[min(340px,32svh)] lg:w-[340px]'
