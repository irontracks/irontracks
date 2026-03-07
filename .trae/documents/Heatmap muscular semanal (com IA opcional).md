## Objetivo (versão com IA)
- Criar um “corpo humano” (unisex ou por sexo) com músculos coloridos por semana.
- Usar IA para:
  1) Classificar exercícios → músculos (auto-tag) com confiança.
  2) Gerar alertas e recomendações contextualizadas (sem inventar dados).

## Arquitetura (IA + guardrails)
- **Núcleo determinístico**: cálculo semanal de volume por músculo (hard sets / tonnage opcional) a partir dos logs reais.
- **IA como copiloto**: só escreve *interpretação* e *sugestões*, e só auto-tag quando o exercício não tiver mapeamento.
- **Fallback**: se IA falhar, ainda renderiza o mapa com cálculo determinístico (sem “sumir tudo”).

## Dados necessários
1. **Lista canônica de músculos** (MVP): peitoral, dorsais, upper back/trapézio, deltoide ant/lat/post, bíceps, tríceps, abdômen, eretores, glúteos, quadríceps, posteriores, panturrilhas.
2. **Fonte de treinos**: usar os logs de sets já existentes (reps/peso/done/isWarmup/RIR/RPE se houver) e consolidar por semana.

## IA 1 — Auto-tag de exercícios (exercício → músculos)
1. Criar/usar um “catálogo de exercícios” com chave canônica (nome normalizado + variações).
2. Quando aparecer um exercício sem mapeamento:
   - Chamar endpoint IA para retornar JSON:
     - `primary`: [{ muscleId, weight }]
     - `secondary`: [{ muscleId, weight }]
     - `unilateral`: boolean
     - `confidence`: 0..1
     - `notes`: string curta
   - Salvar o mapeamento (com `confidence` e `source: ai`).
3. Regras:
   - Pesos devem somar ~1 (normalizar se vier diferente).
   - Se `confidence < 0.6`, marcar como “precisa revisão” (UI opcional depois).

## IA 2 — Insights semanais (alertas e recomendações)
1. Criar endpoint IA que recebe:
   - semana (datas), volumes por músculo (hard sets), tendências vs semana anterior, e top exercícios contribuidores.
2. Retorno JSON (estrito):
   - `imbalanceAlerts`: [{ type, severity, muscles, evidence, suggestion }]
   - `recommendations`: [{ title, actions: string[] }]
   - `summary`: string[] (3–6)
3. Guardrails:
   - Prompt proíbe inventar números; só pode usar os números enviados.
   - Se IA falhar/JSON inválido → retornar `ok:false` e UI mostra apenas o mapa.

## UI/UX
1. **Card “Mapa muscular da semana”** no dashboard:
   - SVG frente/costas (unisex no v1; v2 troca SVG por sexo se quiser).
   - Cores por músculo: escala baseada em `ratio` vs alvo (ou percentil interno da semana).
   - Tap no músculo abre tooltip: sets, tendência, top exercícios.
2. **Tela detalhada**:
   - Heatmap + lista de músculos ordenada por volume.
   - Seção “Alertas” e “Recomendações” (texto da IA).

## Metas (alvos) — simples no v1
- Default por músculo (perfil “geral”): faixa semanal (min/max) configurável depois.
- IA não define metas; apenas comenta com base em faixas padrão.

## Validação
- Simular 3 cenários:
  1) semana com poucos treinos,
  2) semana com alto volume em 1 músculo,
  3) exercício novo sem mapeamento.
- Conferir:
  - mapa não quebra sem IA,
  - auto-tag cria mapeamento,
  - insights retornam JSON válido.

Vou implementar seguindo esse desenho com IA e fallback determinístico.