Não há skill pronto para isso (só existe o criador de skills), então vou ajustar diretamente o layout/CSS.

## 1) PDF/Relatório: valor de “carga/volume” estourando a caixa
### Causa
- No relatório dentro do app, o card **Volume (Kg)** usa `text-3xl font-mono` em uma linha única, e em telas estreitas o número + `kg` acaba passando da largura do card: [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js#L713-L735).
- No HTML do PDF (print), o card de Volume ainda tem `font-size: 28px` inline (não usa a classe `.value`), então não tem comportamento responsivo: [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildHtml.js#L294-L300).

### Ajuste
- Em [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js):
  - Renderizar o volume em um `flex flex-wrap` com número e unidade separados (`14.999,5` + `kg`).
  - Reduzir levemente a tipografia no mobile (`text-2xl sm:text-3xl`) e garantir `min-w-0`/`leading-none`.
  - Resultado: nunca “vaza” do card e mantém visual premium.
- Em [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildHtml.js):
  - Trocar o bloco do volume para usar classes (`value-row`, `value`, `unit`).
  - Ajustar `.value` com `font-size: clamp(...)` e `overflow-wrap:anywhere`.
  - `value-row` com `flex-wrap` para o `kg` quebrar sem estourar.

## 2) Histórico: “Selecionar” e “+” caberem ao lado do título no mobile
### Causa
- O header do Histórico hoje no mobile quebra em duas linhas por falta de espaço (botões com padding/altura grandes): [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L593-L623).

### Ajuste
- Em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js):
  - Voltar o header do **mobile** para **uma linha** (`flex-nowrap`).
  - Diminuir “bem pouco”:
    - Botão **Selecionar**: `h-10` → `h-9`, `px-3`, `text-[11px]`.
    - Botão **+**: virar botão quadrado `w-9 h-9` só ícone (mantém premium e cabe fácil).
  - Deixar o título `truncate` para dar prioridade aos botões sem quebrar layout.

## Validação
- Abrir no iPhone (simulado) e checar:
  - Volume não vaza do card.
  - “Histórico” + botões ficam na mesma linha.
- Rodar `npm run build`.
