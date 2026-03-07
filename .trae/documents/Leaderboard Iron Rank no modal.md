## Objetivo
- Transformar o card **“NÍVEL X — IRON RANK”** em **clicável**.
- Ao clicar, abrir um **modal** mostrando o **ranking global** (professores e alunos) de **quem levantou mais peso (volume total em kg) no app até hoje**.

## Estratégia (robusta e escalável)
### 1) Backend (Supabase/Postgres) — leaderboard eficiente
- Criar uma função SQL (RPC) `iron_rank_leaderboard(limit_count int)` que:
  - Agrega **volume total** por usuário a partir de `workouts` (somente `is_template = false`).
  - Expande `workouts.notes->logs` (JSON) e soma `weight * reps` com casting seguro.
  - Faz join com `profiles` para retornar `display_name`, `photo_url`, `role`.
  - Retorna apenas usuários com volume > 0, ordenado desc.
- Configurar permissões/RLS para **auth users** poderem chamar a RPC (sem vazar colunas sensíveis).

### 2) Server action
- Implementar em [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js) uma action `getIronRankLeaderboard(limitCount)` que chama `supabase.rpc('iron_rank_leaderboard', { limit_count: ... })` e retorna `{ ok, data, error }`.

### 3) UI/UX — modal high-ticket, leve e rápido
- Em [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx):
  - Tornar o card de nível um `button`/`div role=button` com hover/active.
  - Ao clicar, abrir modal no padrão do app (mesma estrutura do [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js)): `fixed inset-0 bg-black/80 ...`.
  - Dentro do modal:
    - Header “IRON RANK — Ranking Global”.
    - Loader enquanto busca.
    - Lista top N com: posição, avatar (photo_url), nome (display_name), badge de role (coach/aluno), volume total formatado.
    - Destaque do usuário atual (row com borda amarela).

## Validação
- Abrir dashboard, clicar no card NÍVEL → modal abre.
- Ranking lista ordenado corretamente e fecha com X/Escape.
- Rodar lint/TypeScript diagnostics.

## Fallback (caso você queira sem SQL agora)
- Versão rápida: agregar em JS lendo `workouts` e somando `notes.logs` no servidor.
- Porém isso não escala e pode ficar lento conforme o app crescer; por isso prefiro a RPC.