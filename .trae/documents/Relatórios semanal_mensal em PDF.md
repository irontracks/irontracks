## O que você quer
- Botões **RELATÓRIO SEMANAL** e **RELATÓRIO MENSAL** devem gerar um **PDF completo, bonito e bem estruturado**, com **logo IRONTRACKS** e opção de **salvar (baixar)**.

## O que já existe no app (vantagem)
- Esses botões já abrem um modal com métricas do período + insights (hoje só “texto para compartilhar”).
- Já existe um gerador de PDF no backend: endpoint **/api/report** transforma um HTML em PDF via Puppeteer (igual o PDF do relatório de treino individual).

## O que vou implementar
### 1) Template HTML do relatório de período (semanal/mensal)
- Criar um gerador de HTML específico para **Resumo semanal** e **Resumo mensal** com:
  - Cabeçalho com **logo (icone.png)** + marca IRONTRACKS + nome do aluno (se disponível) + período (datas).
  - Seção “Resumo do período”: treinos, tempo total, média por treino, volume total/médio, sets totais, reps totais, dias treinados.
  - Seção “Top exercícios”: por volume e por frequência.
  - Seção “Sessões do período”: tabela/lista com data, título, duração e volume estimado (já existe em `sessionSummaries`).
  - Seção “Insights”: summary/highlights/focus/nextSteps/warnings do `periodAi`.
- O HTML será **print-friendly** (A4), com paginação no rodapé já cuidada pelo /api/report.

### 2) Botão “Baixar PDF” no modal de relatório
- No modal que abre ao clicar **Relatório semanal/mensal**, adicionar:
  - Botão **Baixar PDF** (ou “Gerar PDF”) com loading.
  - Ao clicar: montar HTML do período + chamar **/api/report** para receber o PDF.
  - Fazer **download automático** (salvar) e também permitir **prévia** (iframe) como no relatório de treino.

### 3) Opção de salvar/compartilhar
- Manter o botão atual de **Compartilhar** (texto).
- Adicionar opção de **Salvar** via download do PDF (Content-Disposition já vem do /api/report).

## Arquivos que vou mexer
- `src/components/HistoryList.js` (onde estão os botões e o modal do relatório de período)
- Criar util novo: `src/utils/report/buildPeriodReportHtml.js` (ou similar) para manter o HTML organizado

## Validação
- `npm run lint` e `npm run build`.
- Abrir o Histórico e clicar:
  - **Relatório semanal → Baixar PDF** (gera arquivo .pdf com logo)
  - **Relatório mensal → Baixar PDF**
- Conferir se o PDF abre e baixa corretamente no desktop/mobile.