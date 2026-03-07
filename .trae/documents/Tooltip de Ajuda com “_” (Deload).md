## Objetivo

* Adicionar um “?” discreto para termos menos conhecidos (começando por **DELOAD**) que, ao clicar, mostre uma explicação curta.

* Evitar poluição visual: o layout do card/modal não muda; apenas acrescenta o “?” de forma sutil.

## Padrões já existentes (para reaproveitar)

* O app já tem um sistema central de diálogo/alerta via `useDialog` + `GlobalDialog` ([GlobalDialog.tsx](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/src/components/GlobalDialog.tsx)).

* Já há botões com tooltip nativa por `title` (ex.: [AssessmentButton.tsx](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/src/components/assessment/AssessmentButton.tsx)).

* Não há Popover/Radix pronto; então a solução mais segura e consistente é usar `useDialog().alert` ao clicar.

## Comportamento (UX) — sem poluição

* O “?” será um mini-botão circular ao lado do termo (ex.: ao lado do texto **Deload**).

* Desktop:

  * O “?” fica com `opacity` baixa e aparece mais no hover/focus do botão (ou do container), para não poluir.

  * Tooltip nativa (atributo `title`) opcional no hover: “O que é Deload?”.

* Mobile:

  * O “?” fica visível (mas pequeno) para ser clicável.

* Clique no “?” abre um alerta pequeno (GlobalDialog) com título e 2–3 linhas de explicação.

## Conteúdo (texto curto e objetivo)

* **Título**: “O que é Deload?”

* **Descrição** (curta):

  * “Deload é uma redução planejada de carga/volume para recuperar e manter progresso.”

  * “Use quando há fadiga alta, queda de performance ou sinal de overtraining.”

  * “Aqui ele sugere um peso menor e aplica automaticamente nas séries.”

## Implementação (super concreta)

1. **Criar um componente reutilizável**

   * Novo componente `HelpHint` (ex.: `src/components/ui/HelpHint.tsx`).

   * Props:

     * `title: string`

     * `text: string`

     * `tooltip?: string` (para `title` nativo)

     * `className?`

   * Render:

     * Botão circular com “?” (ou ícone `HelpCircle` do Lucide, mas visual de “?”), tamanho \~`h-5 w-5`.

     * `onClick` chama `useDialog().alert(text, title)`.

     * Estilo discreto: borda neutra, texto neutro; hover para amarelo.

2. **Aplicar no treino ativo (Deload)**

   * Em [ActiveWorkout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20\(trae\)/App%20IronTracks/src/components/ActiveWorkout.tsx), no botão do card que hoje mostra “Deload”, adicionar o `HelpHint` ao lado do label.

   * Requisito “não mudar modal”: não tocar no modal do Deload; só acrescentar o “?” junto ao termo.

3. **Preparar para expansão (sem fazer bagunça)**

   * Criar um map simples `HELP_TERMS` (no próprio `HelpHint` ou num arquivo `src/utils/help/terms.ts`) para centralizar textos.

   * Começar com `deload` e deixar pronto para incluir `RPE`, `Drop-set`, `Rest-Pause`, `Cluster` sem duplicar strings.

## Testes / Validação

* Manual:

  * Abrir treino ativo → localizar botão Deload → clicar no “?” → abrir explicação → fechar.

  * Verificar que o layout do card e o modal do Deload permanecem iguais (apenas o “?” é novo).

  * Conferir desktop (hover) e mobile (tap) com comportamento esperado.

* Automático:

  * Rodar `npm run test:smoke`.

## Entregáveis

* “?” discreto ao lado de **Deload** com explicação curta ao clicar.

* Componente `HelpHint` reutilizável e pronto para outros termos.

