## Sim — só o necessário
- Vou mexer **somente** nos pontos diretamente envolvidos em: gerar a nota via Gemini, exibir no relatório e imprimir no PDF.
- Sem migrations, sem tabelas novas, sem mexer em fluxo de login, dashboard, etc.

## Arquivos que serão alterados (mínimo)
1) [post-workout-insights/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/post-workout-insights/route.ts)
2) [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js)
3) [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildHtml.js)

## Implementação
### 1) API da IA (reaproveitar o que já existe)
- Estender o JSON retornado pela rota atual para incluir 3 campos novos:
  - `ratingStars` (0–5)
  - `ratingLabel` (texto curto)
  - `ratingReason` (1 frase)
- Atualizar o prompt para exigir esses campos no JSON.
- No `normalizeAi`, validar e limitar `ratingStars` para 0–5.
- Salvar isso junto com o `session.ai` no `workouts.notes` (como já é feito hoje), evitando chamadas repetidas.

### 2) UI (relatório na tela)
- Dentro do card “IA” em `WorkoutReport.js`, renderizar acima do resto:
  - estrelas preenchidas (0–5)
  - texto “Avaliação da IA: X/5 — {ratingLabel}”
  - `ratingReason` abaixo
- Reutilizar o botão já existente “Gerar/Regerar” (ele passa a gerar insights + rating no mesmo request).

### 3) PDF
- Em `buildHtml.js`, incluir uma pequena seção “Avaliação da IA” no HTML antes de “Análise Inteligente”, desenhando as estrelas via HTML/CSS (sem novas imagens/deps).

## Escala (para ficar intuitivo)
- Vou implementar como: **0 pior / 5 excelente** (padrão universal de estrelas). Se você quiser mesmo “0 muito bom”, eu só inverto a legenda/escala depois, mas a UI fica menos intuitiva.

## Validação
- Gerar IA uma vez e confirmar:
  - estrelas aparecem no relatório (tela)
  - PDF inclui estrelas
  - reabrir o mesmo treino não precisa gerar de novo (já salvo em `notes`).