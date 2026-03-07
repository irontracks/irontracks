## Diagnóstico
- O RPC do Supabase `iron_rank_leaderboard` retorna campos em snake_case: `user_id`, `display_name`, `photo_url`, `total_volume_kg` (ver migrations em `supabase/migrations`).
- A UI do modal em [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx) está mapeando como camelCase (`userId`, `displayName`, `photoUrl`, `totalVolumeKg`).
- Resultado: o `userId` vira string vazia, o filtro remove todas as linhas e o leaderboard fica vazio — por isso não aparece o peso total dos outros usuários.

## Correção
### 1) Normalizar a resposta do leaderboard
- Ajustar [getIronRankLeaderboard](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js) para converter cada linha do RPC para o formato esperado pela UI:
  - `user_id → userId`
  - `display_name → displayName`
  - `photo_url → photoUrl`
  - `total_volume_kg → totalVolumeKg`
- Manter compatibilidade aceitando também camelCase caso alguma fonte já retorne assim.

### 2) Simplificar/robustecer a UI
- Em [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx), remover suposições de camelCase “puro” e garantir que renderize linhas corretamente.

## Validação
- Rodar `npm run lint` e `npm run build`.
- No app, abrir **Iron Rank → Ranking Global** e confirmar que aparecem usuários com seus volumes (kg) no ranking.

Posso executar essa correção agora?