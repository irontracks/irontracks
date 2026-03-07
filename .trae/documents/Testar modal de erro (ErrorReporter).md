## Resposta (dá, e é uma ótima aplicação)
Sim: o Gemini é muito bom para entender variações de escrita (“supino reto”, “bench press”, “supino barra”) e pode aumentar bastante os acertos da evolução.

O cuidado é **não deixar o Gemini decidir sozinho em tempo real** na geração do PDF (custo/latência/erro). O melhor desenho é: Gemini ajuda a criar/atualizar um **dicionário de aliases → exercício canônico**, e o relatório só consulta esse dicionário.

## Como usar o que já existe (sem reescrever tudo)
- Hoje sua evolução provavelmente agrupa por `exercises.name` (texto). A melhoria é adicionar uma etapa de **normalização** antes de somar volume/PR:
  - `name` → `alias_normalized` → `canonical_exercise_id` (se existir) → agrupar por `canonical_exercise_id`.
- Onde não existir mapping, cai em fallback determinístico e/ou entra para fila de resolução.

## Arquitetura recomendada (alto nível)
### 1) Normalização determinística (primeira linha)
- lower-case, remover acentos, padronizar espaços, remover sufixos comuns, dicionário de abreviações.
- Isso já resolve muito e reduz chamadas ao Gemini.

### 2) Cache definitivo no banco (fonte de verdade)
- `exercise_canonical` (lista oficial)
- `exercise_alias` (alias_normalized → canonical_id, confidence, origem: deterministic|gemini|human)
- Regra: **se alias existe, nunca chama IA**.

### 3) Gemini só para casos “unknown/low confidence”
- Entrada mínima (sem PII): o nome do exercício + top candidatos determinísticos.
- Saída estruturada (JSON): canonical sugerido + confidence.
- Se confidence baixo, manda para revisão humana (admin/professor) e só depois grava alias.

### 4) Não bloquear PDF
- Se Gemini falhar/timeout: gerar PDF mesmo assim usando fallback (sem agrupar ou agrupando só se confidence alta).

## Plano de implementação
1) Mapear como hoje o relatório calcula evolução (onde agrupa por nome).
2) Criar migrations das tabelas `exercise_canonical` e `exercise_alias` + índices e RLS por tenant.
3) Implementar pipeline:
   - função de normalização
   - matcher determinístico (top-K candidatos)
   - resolvedor via Gemini apenas quando necessário
   - persistência do alias aprovado (cache)
4) Ajustar o gerador do PDF para agrupar por `canonical_id` quando existir.
5) Criar uma tela/admin simples “Revisar exercícios não reconhecidos” (human-in-the-loop).
6) Observabilidade: métricas de acerto (quantos foram resolvidos por cache vs Gemini).

Se você aprovar, eu começo pelo caminho mais seguro: **normalização + alias table + fallback**, e só depois plugo o Gemini para resolver a cauda longa.