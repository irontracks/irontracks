## Diagnóstico
- O erro ao clicar em **Salvar** vem do banco (RPC `save_workout_atomic`) tentando converter `rpe` para `numeric`.
- O Wizard/IA está gerando `rpe` como **range string** (ex.: `"7-9"` / `"6-8"`). Quando o RPC faz `::numeric`, o Postgres retorna `invalid input syntax for type numeric`.

## Correção (o que vou implementar)
### 1) Padronizar o output da IA para `rpe` numérico
- Ajustar o schema/prompt do endpoint [/api/ai/workout-wizard](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/workout-wizard/route.ts) para exigir:
  - `rpe: number | null` (ex.: `8`), proibindo ranges.
- Ajustar validação/normalização para rejeitar/auto-corrigir ranges.

### 2) “Cinto de segurança” antes de salvar (corrige também treinos antigos)
- No payload do save (antes do RPC), normalizar `rpe`:
  - Se vier `"7-9"`, converter para **média** (`8`).
  - Se vier texto inválido, salvar `null`.
- Ponto exato: construção de `p_exercises` em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js).

### 3) Hardening no banco (evitar regressão por qualquer cliente)
- Atualizar o RPC `save_workout_atomic` para usar um parser tolerante (`try_parse_numeric`) ao invés de `::numeric` direto em `rpe` (e opcionalmente `weight`).
- Arquivo de migração alvo: [20260113212000_save_workout_atomic.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260113212000_save_workout_atomic.sql).

## Verificação
- Gerar treino via Wizard → **Abrir no editor** → **Salvar** (sem erro).
- Repetir com restrições que antes geravam `rpe` em range.
- Rodar build/lint e validar `/dashboard`.

Vou aplicar essa correção com a regra padrão: **range vira média** (`"7-9"` → `8`).