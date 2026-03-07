## 1) PDF (Relatório) — deixar premium e sem sobreposição
### Problemas identificados
- No mobile, os botões `Salvar / Foto / Voltar` estão em `position: fixed` e **ficam por cima** do conteúdo do relatório (igual no seu print). Isso vem do bloco em [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/WorkoutReport.js) que renderiza esses botões com `fixed top-4 right-4`.
- Nos HTMLs gerados para impressão/preview:
  - Header usa `display:flex` sem wrap → títulos longos colidem com marca/data.
  - Grid de stats é `repeat(4,1fr)` sem responsivo → no mobile fica espremido e “poluído”.
  - Falta regras de quebra de página e “avoid break” → card/tabela podem quebrar e sobrepor visualmente ao imprimir.

### Mudanças
A) **WorkoutReport.js** (UI do relatório dentro do app)
- Trocar a barra de ações (hoje `fixed`) por um **header sticky** dentro do modal/tela do relatório:
  - `position: sticky; top: env(safe-area-inset-top); z-index` alto
  - fundo sólido/blur + borda inferior
  - isso elimina sobreposição e fica premium.
- Ajustar o container do relatório para **não precisar** de paddingTop “adivinhando” altura dos botões.

B) **CSS/HTML do PDF** (o que realmente vai pro print)
- Em [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/report/buildHtml.js) e [templates.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/report/templates.js):
  - Deixar o header `flex-wrap: wrap` + gaps + limites (`max-width`, `word-break`).
  - Adicionar `@media (max-width: 520px)` para:
    - header virar coluna
    - stats grid virar 2 colunas (ou 1) com números grandes quebrando corretamente.
  - Adicionar regras “print premium”:
    - `print-color-adjust: exact` / `-webkit-print-color-adjust: exact`
    - `break-inside: avoid` nos cards/seções
    - `thead { display: table-header-group }` para tabelas
    - `@page` com margem consistente (ex.: 10–12mm) e tipografia/spacing refinados.
  - Refinar visual (premium): tipografia, hierarquia, espaçamentos, bordas suaves, reduzir ruído (menos sombras, melhor contraste), padronizar tamanhos e títulos.

### Validação
- Abrir relatório no iPhone (simulado) e confirmar que **nada cobre o cabeçalho**.
- Abrir preview de impressão (iframe/popup) e verificar:
  - header não colide
  - cards/tabelas não quebram feio
  - `npm run build` passa.

## 2) Histórico — arrumar somente a versão mobile
### Problemas identificados no mobile (pelo layout atual)
- Header do Histórico tem `flex-wrap` com botões grandes (Selecionar + +) → quebra e fica “bagunçado” em telas estreitas.
- Cards de resumo estão fixos em `grid-cols-3` → muito comprimido no mobile.
- Botões de “Relatórios rápidos” ficam lado a lado e podem quebrar de forma ruim.

### Mudanças
- Em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/HistoryList.js):
  - Header superior:
    - trocar para `flex-col sm:flex-row`.
    - primeira linha: back + título.
    - segunda linha (mobile): botões alinhados e/ou com largura total.
    - reduzir padding/width dos botões no mobile (`px-3`, texto menor) para ficar limpo.
  - Resumo:
    - `grid-cols-1 sm:grid-cols-3` (ou `grid-cols-2` com o último `col-span-2`) para ficar legível.
  - Relatórios rápidos:
    - no mobile, botões `w-full` empilhados; no desktop mantém lado a lado.

### Validação
- Screenshot iPhone (simulado) da tela de Histórico e checar alinhamento.
- Desktop não muda (mantém perfeito).

Se você confirmar, eu implemento essas alterações nesses 4 arquivos e te devolvo prints (desktop + iPhone) do antes/depois.