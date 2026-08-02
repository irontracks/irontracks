-- Sync incremental da sessão ativa (perf, ago/2026).
--
-- O client reenviava o `state` INTEIRO (workout completo + logs) a cada série
-- logada (debounce 900ms) — tráfego dominante do app durante o treino em 4G.
-- Esta RPC aplica só o DELTA dos logs; o snapshot cheio continua existindo
-- (heartbeat 30s + toda mudança estrutural), então qualquer drift se corrige
-- sozinho em <=30s.
--
-- SECURITY INVOKER de propósito: roda como o usuário logado e só toca a
-- PRÓPRIA linha (user_id = auth.uid()); RLS da tabela continua valendo.
-- Retorna false quando não há linha — o client cai no upsert cheio.

create or replace function public.patch_active_session_logs(
  p_set jsonb,
  p_del text[],
  p_saved_at bigint,
  p_device_id text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_state jsonb;
  k text;
begin
  if uid is null then
    return false;
  end if;

  select state into row_state
  from public.active_workout_sessions
  where user_id = uid
  for update;

  if row_state is null then
    return false; -- sem linha/estado: o client faz o upsert cheio
  end if;

  row_state := jsonb_set(
    row_state,
    '{logs}',
    coalesce(row_state->'logs', '{}'::jsonb) || coalesce(p_set, '{}'::jsonb)
  );

  if p_del is not null then
    foreach k in array p_del loop
      row_state := row_state #- array['logs', k];
    end loop;
  end if;

  row_state := row_state
    || jsonb_build_object('_savedAt', p_saved_at, '_deviceId', p_device_id);

  update public.active_workout_sessions
  set state = row_state,
      updated_at = now()
  where user_id = uid;

  return true;
end;
$$;

comment on function public.patch_active_session_logs(jsonb, text[], bigint, text)
  is 'Merge incremental de logs no state da sessão ativa do próprio usuário (perf do sync de treino). Retorna false sem linha → client faz upsert cheio.';
