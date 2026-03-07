## Diagnóstico rápido
- “Não vira mãozinha”: o card é um `button`, mas hoje a classe não força `cursor-pointer` (dependendo do reset/CSS do browser pode ficar como cursor padrão).
- “Ao clicar dá erro”: o modal chama a RPC `iron_rank_leaderboard`. O erro mais provável (e comum aqui) é a função SQL quebrar ao fazer cast `(e.value->>'done')::boolean` quando o campo `done` vem vazio/"undefined"/string não-boolean em alguns treinos antigos; isso gera exception e a RPC falha.

## Correções
### 1) Cursor de clique no card
- Ajustar o card de nível (Iron Rank) para ter `cursor-pointer` e também `focus` visível.
- Arquivo: [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx)

### 2) Tornar a RPC “à prova de dados ruins”
- Criar uma nova migration que faz `CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(...)` com parsing seguro do `done`:
  - Em vez de `::boolean`, usar checagem por string: `lower(coalesce(done_text,'')) in ('true','t','1','yes','y')`.
- Mantém o resto (soma `weight * reps`, limit cap, join em `profiles`, grants) igual.
- Arquivo novo: `supabase/migrations/20260121xxxxxx_fix_iron_rank_leaderboard_rpc.sql`

### 3) Mensagem de erro amigável no modal
- Se a RPC falhar (ex.: migrations não aplicadas, permission, etc.), exibir no modal uma mensagem clara (“Ranking indisponível: migrations pendentes no Supabase” quando detectar erro de function/table missing).

## Validação
- Hover do card mostra cursor de mão.
- Clique abre modal sem erro.
- Ranking lista usuários ordenados por volume.
- `npm run lint` sem falhas.
