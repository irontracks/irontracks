-- Medicamentos: lembrete por push + botão "Tomei" (03/10/2026, pedido do dono).
--
-- Duas tabelas:
--   * `medications`        — o remédio: nome, dose, horários fixos do dia (HH:MM, BRT),
--                            dias da semana, início/fim opcionais.
--   * `medication_intakes` — cada "Tomei" (um registro por remédio + dia + horário).
--
-- ⚠️ DADO DE SAÚDE — LGPD art. 11 (dado pessoal sensível). Decisão do dono: o
-- professor VINCULADO (`students.teacher_id`) vê e edita a lista do aluno, e o
-- admin também. O aluno é avisado quando o professor altera (notificação
-- `medication_updated`) e a tela diz que o professor pode ver e editar.
-- "Tomei" é só do aluno: INSERT/DELETE de tomadas só pelo dono, e a tabela de
-- tomadas NÃO tem policy de UPDATE (uma tomada se registra ou se desfaz; não se
-- reescreve).
--
-- Dia = coluna `date` em BRT, NUNCA derivado de `created_at`/`taken_at`
-- (timestamptz em UTC): dose das 23h30 cairia no dia seguinte.
--
-- ⚠️ O `default ACL` do schema `public` concede TUDO a `anon` em tabela nova.
-- O REVOKE explícito abaixo é obrigatório — a chave anônima viaja no bundle do app.
--
-- O gatilho de 5 em 5 minutos do lembrete NÃO está aqui: ver a migration
-- `20261003120100_medication_reminders_pg_cron.sql`, que só pode ser aplicada
-- DEPOIS do deploy da rota.

BEGIN;

CREATE TABLE IF NOT EXISTS public.medications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  dose        text CHECK (dose IS NULL OR char_length(dose) <= 60),
  -- Horários HH:MM (BRT), 1 a 8 por remédio. O regex roda sobre o texto unido
  -- porque CHECK não aceita subconsulta; `array_position(..., NULL)` barra elemento
  -- nulo, que o `array_to_string` pularia em silêncio.
  times       text[] NOT NULL
                CHECK (
                  array_length(times, 1) BETWEEN 1 AND 8
                  AND array_position(times, NULL) IS NULL
                  AND array_to_string(times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'
                ),
  -- 0 = domingo … 6 = sábado (mesma convenção do resto do app). Padrão: todo dia.
  weekdays    smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'
                CHECK (
                  array_length(weekdays, 1) BETWEEN 1 AND 7
                  AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
                ),
  start_date  date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  -- Inclusivo: no dia do fim o lembrete ainda sai.
  end_date    date,
  notes       text CHECK (notes IS NULL OR char_length(notes) <= 300),
  active      boolean NOT NULL DEFAULT true,
  -- Quem criou/alterou: o próprio aluno ou o professor. SET NULL de propósito:
  -- um professor que apaga a conta NÃO leva embora os dados de saúde do aluno.
  created_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medications_end_after_start CHECK (end_date IS NULL OR end_date >= start_date),
  -- Alvo da FK composta das tomadas: impede uma tomada apontar para o remédio de
  -- OUTRO usuário (o `user_id` da tomada tem de ser o mesmo do remédio).
  CONSTRAINT medications_id_user_unique UNIQUE (id, user_id)
);

COMMENT ON TABLE public.medications
  IS 'Medicamentos do usuário (horários fixos em BRT). DADO DE SAÚDE sensível (LGPD art. 11): professor vinculado lê e edita por decisão do dono; o aluno é avisado das alterações.';

CREATE TABLE IF NOT EXISTS public.medication_intakes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id   uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Dia BRT da dose (NÃO derivar de taken_at).
  date            date NOT NULL,
  scheduled_time  text NOT NULL CHECK (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  taken_at        timestamptz NOT NULL DEFAULT now(),
  recorded_by     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT medication_intakes_medication_fk
    FOREIGN KEY (medication_id, user_id)
    REFERENCES public.medications (id, user_id) ON DELETE CASCADE,
  -- Duas doses no mesmo horário são remédios DIFERENTES (medication_id difere).
  CONSTRAINT medication_intakes_once UNIQUE (medication_id, date, scheduled_time)
);

COMMENT ON TABLE public.medication_intakes
  IS 'Registro de "Tomei" por remédio + dia BRT + horário. DADO DE SAÚDE sensível (LGPD art. 11). Só o dono grava/desfaz; professor vinculado e admin só leem. Sem UPDATE.';

CREATE INDEX IF NOT EXISTS idx_medications_user
  ON public.medications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medications_start_active
  ON public.medications (start_date) WHERE active;
CREATE INDEX IF NOT EXISTS idx_medication_intakes_user_date
  ON public.medication_intakes (user_id, date DESC);

CREATE OR REPLACE FUNCTION public.medications_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.medications_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.medications_touch_updated_at() FROM anon;
DROP TRIGGER IF EXISTS trg_medications_updated_at ON public.medications;
CREATE TRIGGER trg_medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.medications_touch_updated_at();

-- Grants: nada para anon; CRUD para authenticated (a RLS decide linha a linha).
REVOKE ALL ON public.medications FROM anon;
REVOKE ALL ON public.medication_intakes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medication_intakes TO authenticated;

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_intakes ENABLE ROW LEVEL SECURITY;

-- medications: o dono, o professor vinculado e o admin leem E escrevem.
DROP POLICY IF EXISTS medications_select ON public.medications;
CREATE POLICY medications_select ON public.medications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS medications_insert ON public.medications;
CREATE POLICY medications_insert ON public.medications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS medications_update ON public.medications;
CREATE POLICY medications_update ON public.medications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS medications_delete ON public.medications;
CREATE POLICY medications_delete ON public.medications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

-- medication_intakes: lê quem lê o remédio; só o dono marca/desfaz "Tomei".
-- SEM policy de UPDATE: tomada se registra ou se desfaz, nunca se reescreve.
DROP POLICY IF EXISTS medication_intakes_select ON public.medication_intakes;
CREATE POLICY medication_intakes_select ON public.medication_intakes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS medication_intakes_insert_own ON public.medication_intakes;
CREATE POLICY medication_intakes_insert_own ON public.medication_intakes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS medication_intakes_delete_own ON public.medication_intakes;
CREATE POLICY medication_intakes_delete_own ON public.medication_intakes
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;
