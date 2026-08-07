-- Marca o instante em que o usuário abriu o app e o badge do ícone foi zerado.
-- O cálculo do badge (sendPushToUsers) passa a contar SÓ as notificações não
-- lidas criadas depois deste instante — sem isso o número voltava cheio
-- (32 -> 33) na próxima notificação, mesmo com o ícone já zerado no device.
-- NULL = nunca zerou (comportamento antigo: conta todas as não lidas).
alter table public.user_settings
  add column if not exists badge_cleared_at timestamptz;

comment on column public.user_settings.badge_cleared_at is
  'Instante da última vez que o app foi aberto e o badge do ícone iOS foi zerado. Usado por sendPushToUsers para não recontar notificações antigas.';
