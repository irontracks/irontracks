-- Método por SÉRIE no plano.
--
-- Até aqui o método de uma série só existia na sessão (`logs["ex-set"].per_set_method`):
-- trocar Drop-Set → Normal valia para o treino do dia e o plano seguia igual, sem
-- nenhuma pista de que aquilo era temporário — o mesmo defeito que
-- `askPersistSetChange` corrigiu para adicionar/remover série.
--
-- NULL = sem escolha explícita; a inferência de sempre (nota do exercício,
-- advanced_config, ex.method) continua valendo. Só um valor explícito vence a
-- regra derivada — é a mesma razão pela qual 'Normal' é gravado por extenso e
-- não como string vazia.
alter table public.sets add column if not exists per_set_method text;

comment on column public.sets.per_set_method is
  'Método escolhido para ESTA série (Normal, Drop-Set, Cluster…). NULL = infere pelo exercício/nota/advanced_config.';
