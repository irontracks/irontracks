-- PERFORMANCE (auditoria UX/perf): o Realtime (decodificação de WAL) é ~90% do tempo do
-- banco. direct_channels estava na publication supabase_realtime mas NENHUM cliente assina
-- suas mudanças via postgres_changes (o app pega o channel id pela RPC
-- get_or_create_direct_channel, não por realtime) — confirmado por grep. Remover para de
-- replicar/decodificar o WAL dessa tabela sem quebrar nada. As tabelas de alta escrita
-- restantes (profiles, notifications, social_follows, invites) SÃO assinadas (ex.: profiles =
-- status online no ChatListScreen) — reduzir o custo delas exige refatorar as subscriptions
-- do cliente (decisão de produto).
alter publication supabase_realtime drop table public.direct_channels;
