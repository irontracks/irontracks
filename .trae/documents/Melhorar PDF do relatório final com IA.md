## Plano (3 pontos)
- Transformar “Salvar PDF” em PDF real (endpoint /api/report), com UX robusta e fallback.
- Evoluir o HTML do relatório para incluir bloco de IA + métricas/insights mais ricos.
- Validar em dev: geração, paginação, estilos dark, e erros (sem crashes).

## Objetivos
- PDF mais robusto: mais informações úteis, leitura profissional, paginação e identidade visual.
- IA dentro do PDF: usar o `session.ai` (Insights pós-treino) e garantir geração quando estiver vazio.
- Sem quebrar fluxo atual: manter preview/impressão como fallback se o PDF server falhar.

## Mudanças de Código (arquivos)
### 1) Incluir IA e mais métricas no HTML do relatório
- Editar [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/report/buildHtml.js)
  - Migrar o tema do HTML para dark (fundo neutro escuro + acentos amarelo/dourado).
  - Adicionar seção “Insights da IA” com render defensivo:
    - `summary`, `highlights[]`, `warnings[]`, `motivation`, `prs[]`, `progression[]` (se existirem).
  - Adicionar um “Resumo executivo” com métricas derivadas dos logs:
    - #exercícios, #séries logadas, total reps, volume total, variação vs treino anterior (já existe volumeDelta), tempo real/total.
  - Garantir `page-break-inside: avoid` nos blocos da IA e nas tabelas para reduzir quebras feias.

### 2) Trocar “Salvar PDF” para gerar PDF real via /api/report
- Editar [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/WorkoutReport.js)
  - Ajustar `handleDownloadPDF()`:
    - `try/catch` completo.
    - Resolver `previousSession` como já faz.
    - Se `session.ai` estiver ausente e o usuário tiver IA disponível, chamar `generatePostWorkoutInsights` antes de montar o HTML (com estado “gerando”).
    - Gerar `html = buildReportHTML(...)`.
    - `fetch('/api/report', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ html, fileName }) })`.
    - Baixar o `blob` `application/pdf` e guardar em estado para preview/compartilhamento.
    - Fallback: se der erro no endpoint, manter o comportamento atual (HTML + iframe + print).
  - Ajustar o `handleShare()` para compartilhar um arquivo `.pdf` quando existir `pdfBlob` do PDF real.
  - Manter feedback visual (spinner/disabled) usando `isGenerating`.

### 3) Melhorar a qualidade do PDF no servidor (pagina/rodapé)
- Editar [api/report/route.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/report/route.js)
  - Configurar `page.emulateMediaType('screen')` (consistência de CSS).
  - Ajustar `page.pdf()` com:
    - `displayHeaderFooter: true`
    - `footerTemplate` com paginação “Página X / Y” e marca discreta IronTracks
    - margens levemente maiores em baixo (para o rodapé)
  - Manter limites: validar `html` e tamanho, e responder JSON estruturado em erros.

## Verificação (no final)
- Rodar o app e testar no modal/relatório:
  - “Salvar PDF” baixa um `.pdf` real e abre corretamente em mobile/desktop.
  - Quando IA já existe, aparece no PDF; quando não existe, gera e inclui.
  - Quando o endpoint falha (simular com erro), fallback para HTML/impressão funciona.
  - Paginação aparece no rodapé e não corta cartões/tabelas de forma agressiva.

## Escopo (para evitar colateral)
- Só mexer no fluxo do PDF do relatório final e no gerador HTML/API relacionados; não vou limpar arquivos duplicados legados nesta rodada.