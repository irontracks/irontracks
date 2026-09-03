-- Frequência cardíaca e origem da sessão de cardio.
--
-- O Apple Watch já coleta FC em tempo real (HKLiveWorkoutBuilder) e mandava os
-- números pelo WatchConnectivity — o app descartava no caminho porque não havia
-- onde guardar. Era o dado que só o relógio tem, e o único que se perdia.
--
-- `source` distingue quem mediu: o iPhone (GPS do CLLocationManager próprio) ou
-- o Watch (HealthKit + GPS do relógio). Sem isso, não dá para explicar ao usuário
-- de onde vem a FC de uma corrida e a ausência dela em outra.
--
-- Colunas ANULÁVEIS e sem default destrutivo: nenhuma das linhas existentes muda.
alter table public.cardio_tracks
  add column if not exists avg_heart_rate smallint
    constraint cardio_tracks_avg_hr_range check (avg_heart_rate is null or (avg_heart_rate between 20 and 260)),
  add column if not exists max_heart_rate smallint
    constraint cardio_tracks_max_hr_range check (max_heart_rate is null or (max_heart_rate between 20 and 260)),
  add column if not exists source text
    constraint cardio_tracks_source_check check (source is null or source in ('iphone', 'apple-watch'));

comment on column public.cardio_tracks.avg_heart_rate is 'FC média em bpm. Hoje só o Apple Watch mede; null em sessão do iPhone.';
comment on column public.cardio_tracks.max_heart_rate is 'FC máxima em bpm. Hoje só o Apple Watch mede; null em sessão do iPhone.';
comment on column public.cardio_tracks.source is 'Quem mediu a sessão: iphone | apple-watch. Null = anterior a 02/09/2026.';
