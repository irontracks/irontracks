## Diagnóstico
- O erro “Could not find the 'sort_order' column of 'workouts' in the schema cache” vem do PostgREST/Supabase quando a coluna **não existe no banco** ou existe mas o **schema cache não foi recarregado**.
- O código já tenta atualizar `workouts.sort_order` (em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js)), então o banco precisa ter essa coluna.

## Correção (Banco)
1. Verificar no Supabase (SQL Editor) se a coluna existe:
   - `select column_name from information_schema.columns where table_schema='public' and table_name='workouts' and column_name='sort_order';`
2. Se **não existir**, aplicar a migration já criada:
   - [20260126121000_workouts_archived_at_and_sort_order.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260126121000_workouts_archived_at_and_sort_order.sql)
   - (local: rodar migrações do Supabase CLI; remoto: rodar o SQL no painel/CI)
3. Se **existir**, recarregar o schema cache do Supabase:
   - Dashboard Supabase → **Settings → API → Reload schema** (ou equivalente).

## Correção (App – UX/Resiliência)
- Ajustar o fluxo de “Salvar lista” para detectar esse erro específico e mostrar um aviso acionável (ex.: “Atualize o banco (migration sort_order) e recarregue o schema cache”).
- Opcional: se o schema não tem `sort_order`, permitir salvar apenas títulos (sem ordenação) em vez de falhar tudo.

## Validação
- Testar no app: Organizar → arrastar → Salvar.
- Confirmar no Supabase que `sort_order` foi atualizado.
- Rodar lint/build.
