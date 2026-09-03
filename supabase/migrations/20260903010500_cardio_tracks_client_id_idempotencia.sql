-- Idempotência do cardio vindo do Apple Watch.
--
-- O relógio manda o resumo por DOIS transportes: `sendMessage` (instantâneo) e,
-- se o reply falhar, `transferUserInfo` (fila persistente). Se o sendMessage
-- CHEGOU ao iPhone mas o reply se perdeu — app suspendendo, timeout —, o mesmo
-- cardio entra pelos dois caminhos e era gravado DUAS vezes: distância, calorias
-- e ofensiva inflados, sem nada no app que denunciasse.
--
-- `WatchCardioSummary` não tinha id e o decode descartava o `sentAt`, então nem
-- por timestamp dava para distinguir reentrega. A chave é gerada no cliente
-- (mesmo padrão de `clientId` em trackMeal e de `finish_idempotency_key` no
-- finish de treino) e o índice único faz o segundo insert virar 23505, que a
-- rota trata devolvendo a linha existente como sucesso.
--
-- Coluna ANULÁVEL: nenhuma linha existente muda, e cardio do iPhone (que não
-- manda chave) continua entrando normalmente.
alter table public.cardio_tracks
  add column if not exists client_id text;

comment on column public.cardio_tracks.client_id is
  'Chave de idempotência gerada pelo cliente. Hoje só o Apple Watch manda; null = iPhone ou anterior a 02/09/2026.';

-- Índice PARCIAL: só as linhas com chave participam da unicidade, então os
-- milhares de cardios sem `client_id` não colidem entre si.
create unique index if not exists cardio_tracks_user_client_id_uniq
  on public.cardio_tracks (user_id, client_id)
  where client_id is not null;
