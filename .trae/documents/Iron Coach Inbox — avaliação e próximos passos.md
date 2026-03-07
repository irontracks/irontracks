## Leitura da ideia (minha avaliação)
A ideia é forte: você transforma o trabalho do coach de “caçar aluno com problema” em uma **fila priorizada de decisões**. Isso aumenta retenção (anti-churn), melhora segurança (controle de carga) e reduz atrito (mensagem sugerida pronta). O diferencial não é “uma tela nova”, e sim o **motor de priorização + dedupe + workflow**.

## Melhorias (o que eu implementaria)
### 1) Definir o Inbox como workflow (não só lista)
- Estados: `novo → triado → aguardando aluno → plano definido → concluído` (+ `sonecado`).
- Ações rápidas: “Responder”, “Pedir info”, “Sonecar”, “Concluir”.
- Dedupe por aluno/janela (ex.: 2–6h) para evitar spam.

### 2) Prioridade explicável (score simples)
- Score audível (sem IA no MVP): `urgência + risco + recência + valor - ruído`.
- Mostrar “por que apareceu” em 2–3 bullets (ex.: “7 dias sem treino”, “queda de volume 35%”, “RPE subiu”).

### 3) Métricas desde o dia 1
- Backlog por prioridade; tempo até 1ª resposta; tempo até resolução (p50/p90).
- Reaberturas/duplicados (qualidade do motor).

### 4) Modelo de dados recomendado
- Tabela imutável de **eventos** (fonte da verdade).
- Tabela de **inbox_items** (derivada e operável) com estado, prioridade, `coach_id/org_id`, `student_id`, `event_ids` (ou relação).
- Auditoria (quem marcou o quê).

### 5) Gemini como copiloto (não piloto)
- Gerar: resumo do contexto + sugestão de mensagem + perguntas faltantes.
- Sempre como rascunho editável; nunca auto-enviar.
- Cache por item e invalidar quando eventos mudarem (custo/latência).

### 6) RLS/segurança (crítico)
- Tudo sempre filtrado por `coach_id`/`org_id` para não vazar cross-tenant.
- Preferir checks diretos (coluna redundante `org_id`) em vez de joins complexos nas policies.

## MVP recomendado (curto e de alto impacto)
1) “Prioridades” com 3 regras: churn (sem treino), queda de volume, aumento brusco de carga.
2) Ações + estados + dedupe.
3) Mensagens sugeridas **templateadas** (sem IA no começo).
4) Depois plugar Gemini para personalizar.

## Próximo passo (se você quiser que eu implemente)
- Eu implemento a primeira versão com: tabela `inbox_items`, feed server-side para o coach, UI “Prioridades”, e Gemini opcional só para rascunho.
- Também incluo RLS + auditoria + dedupe.

Se aprovar, eu começo pelo mapeamento das 3 fontes de evento mais confiáveis hoje (treinos, PRs, mensagens/agenda) e desenho as regras do score.