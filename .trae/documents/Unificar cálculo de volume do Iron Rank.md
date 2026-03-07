## Por que os números divergem
- O card do **Iron Rank (Nível/kg levantados)** usa `computeWorkoutStreakAndStats()` no client e calcula volume lendo `workouts.notes.logs`.
- O **Ranking Global** usa o RPC do Supabase `iron_rank_leaderboard`, que calcula o volume no banco (preferindo `sets/exercises` quando existem e caindo para `notes.logs` no legado).
- Isso cria dois “motores” diferentes de contagem → o seu total no card pode ficar maior/menor que o total do ranking.

## Objetivo
- Fazer o card (Nível + kg levantados) usar **exatamente o mesmo cálculo do banco** que alimenta o ranking, para os números baterem.

## O que vou implementar
### 1) Criar RPC para o volume do usuário logado
- Adicionar migration criando `public.iron_rank_my_total_volume()` (SECURITY DEFINER) que:
  - Usa o mesmo CTE do `iron_rank_leaderboard`.
  - Filtra `uid = auth.uid()`.
  - Retorna `total_volume_kg` (numeric) ou 0.
- GRANT EXECUTE para `authenticated` (e `service_role` como nos outros).

### 2) Atualizar `computeWorkoutStreakAndStats()`
- Manter streak calculado por datas dos treinos.
- Trocar `totalVolumeKg` para vir do RPC `iron_rank_my_total_volume()`.
- Manter fallback (se o RPC não existir/erro transitório) para não quebrar UI.

### 3) Validar
- Rodar `npm run lint` e `npm run build`.
- Conferir no dashboard:
  - Card “Iron Rank” mostra o mesmo total que a linha do usuário no Ranking Global.

Se estiver OK, eu executo essa correção agora.