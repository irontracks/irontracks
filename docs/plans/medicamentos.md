# Plano — Medicamentos (lembrete push + "Tomei")

Branch `feat/medicamentos`. Planejado em 03/10/2026 (Opus, `/planejamento`).
**A seção "Decisões do dono" no fim SUBSTITUI qualquer recomendação deste texto.**

## Decisões já tomadas pelo dono (antes do plano)
1. Local: o agente avalia → **item "Medicamentos" no menu do avatar, abrindo
   modal de tela cheia** (molde `SettingsModal`: estado no `modalStore`,
   render em `DashboardModals.tsx` via `dynamic()`, sem mexer na URL — a regra
   "fora de /app abre o Safari" nem se aplica). Sem 6ª aba; sem card no topo.
2. Horários fixos no dia (HH:MM BRT), vários por remédio; dias da semana
   opcionais; início e fim opcional.
3. Botão "Tomei" na tela (desfazer no mesmo dia). Ação na notificação: não (exige build).
4. **Professor vinculado VÊ E EDITA** (decisão do dono, contrária à
   recomendação de privacidade).
5. Grátis.

## Achados do planejamento (confirmados no banco)
- O job `meal-reminders` em PRODUÇÃO lê `public.cron_secrets where name='cron'`
  com fallback ao Vault; a migration do repo está atrás. A migration do cron
  novo copia o comando de PRODUÇÃO.
- `pg_default_acl` do schema `public` concede tudo a `anon` em tabela nova →
  `REVOKE ALL ... FROM anon` explícito é obrigatório.
- 112 tabelas = `PROD_TABLES_SNAPSHOT`; nenhuma `medic*`. `is_teacher_of` e
  `is_admin` são invoker.

## Schema (aplicar SÓ com "sim" do dono)
**M1 `supabase/migrations/20261003120000_medications.sql`** (molde
`20260902120000_workout_set_media.sql`), em `BEGIN/COMMIT`:
- `medications`: `id`, `user_id → auth.users on delete cascade`, `name text`
  (1–80), `dose text` (≤60), `times text[]` (1–8, HH:MM por regex no
  `array_to_string`), `weekdays smallint[] default '{0..6}'` (0=domingo, ⊆ 0–6),
  `start_date date default (now() at time zone 'America/Sao_Paulo')::date`,
  `end_date date` (≥ start, inclusivo), `notes` (≤300), `active bool default true`,
  `created_by`/`updated_by → auth.users on delete set null`, `created_at`,
  `updated_at`, `unique (id, user_id)`.
- `medication_intakes`: `id`, `medication_id`, `user_id → auth.users cascade`,
  FK composta `(medication_id, user_id) → medications(id, user_id) on delete cascade`,
  `date date` (dia BRT), `scheduled_time text` (HH:MM), `taken_at default now()`,
  `recorded_by → auth.users set null`, `unique (medication_id, date, scheduled_time)`.
- Índices: `medications (user_id, created_at desc)`, `medications (start_date) where active`,
  `medication_intakes (user_id, date desc)`.
- Trigger `medications_touch_updated_at()` com `SET search_path = ''`, revoke de PUBLIC/anon.
- `REVOKE ALL ... FROM anon`; `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`.
- RLS nas duas. `medications` (4 comandos): `user_id = (select auth.uid()) OR
  public.is_teacher_of(user_id) OR (select public.is_admin())`.
  `medication_intakes`: SELECT com a mesma regra; INSERT/DELETE só o dono; sem UPDATE.
- `COMMENT ON TABLE` nas duas. Depois: `get_advisors`, `has_table_privilege('anon',…)=false`,
  catálogo LGPD = 114.

**M2 `supabase/migrations/20261003120100_medication_reminders_pg_cron.sql`** —
job novo `medication-reminders` `*/5 * * * *`, comando copiado do de produção
(`cron_secrets` com fallback ao Vault, `net.http_get` para
`https://irontracks.com.br/api/cron/medication-reminders`, timeout 20000,
`where s.secret is not null`), `unschedule ... where exists` antes. Cabeçalho com
as consultas de diagnóstico. **Aplicar só depois do deploy da rota.**

## Lógica pura — `src/lib/medications/agenda.ts`
Reaproveita por import (sem editar): `normalizarHorario`/`minutosDoDia`
(`lib/nutrition/mealTimes.ts`), `janelaDeLembretes`/`InstanteBrt`
(`lib/nutrition/janelaDeLembrete.ts`), `brtDateKey`, `brtDayStartUtc`.
Funções: `medicamentoValeNoDia`, `dosesVencidasNaJanela` (dia/weekday DO
instante: às 00:02, 23:58 é de ontem; descarta dose anterior ao `created_at`),
`chaveDaDose`, `removerDosesJaTomadas`, `agruparPorHorario` (1 push por
usuário+dia+horário), `textoDoLembrete`, `dosesDoDia`, `podeRegistrarTomada`
(só hoje BRT), `weekdayDoDia`. Datas como 'YYYY-MM-DD' comparadas como string.
Zod em `src/schemas/medications.ts`; tipos em `src/types/medications.ts`.

## Cron — `src/app/api/cron/medication-reminders/route.ts`
Esqueleto de `meal-reminders`: `isCronAuthorizedAsync` ANTES do admin client →
janela → remédios ativos válidos → doses vencidas → tomadas (falha na leitura
= envia mesmo assim) → dedupe por dose `cacheSetNxStatus('med-reminder:'+chave, 26h)`
(`exists` pula, `unavailable` envia) → agrupa → `insertNotifications` com
`type: 'medication_reminder'`, título `💊 08:00 · Losartana` /
`💊 08:00 · 2 medicamentos`, `metadata { medication_ids, time, date }`.
Tipo novo: `NOTIFICATION_TYPE_TO_PREFERENCE` (`notifyMedications`),
`schemas/settings.ts`, toggle em `SettingsSections.tsx` (seção Lembretes),
`TYPE_CONFIG` (função `lembrete`, ícone `Pill`) e **`ROTEADOS_PELO_TIPO`**
(não `DESTINO_POR_TIPO`: a tela é modal, não URL). Não tocar em `apns.ts`/iOS.

## Rotas e núcleo
- `src/lib/medications/mutations.ts`: `list/create/update/deleteMedicationCore`,
  `listIntakesCore` — compartilhado por aluno e professor.
- Aluno: `src/app/api/medications/route.ts` (GET/POST/PATCH/DELETE) e
  `src/app/api/medications/intakes/route.ts` (POST com 409 `dia_virou` se não
  for hoje, horário precisa estar em `times`, upsert no unique; DELETE só hoje).
  `requireUser` + cliente da sessão (RLS) + `parseJsonBody` + rate limit.
- Professor: `src/app/api/teacher/medications/route.ts` (GET com tomadas dos
  últimos 7 dias; POST/PATCH/DELETE). `requireRole(['admin','teacher'])` →
  `parseJsonBody` → `canCoachStudent` → rate limit; toda escrita com
  `.eq('user_id', studentId)`; cliente da sessão; `updated_by`/`created_by`;
  erros por `respondDbError`/`respondInternalError`.
- Aviso ao aluno: `coachChangeNotice.ts` ganha `medication_updated` /
  origem `medication_edit` (janela de 30 min), via `waitUntil(...catch)`.

## Interface
- `src/hooks/useMedications.ts` (otimista, reverte em falha, `logWarnRemote`).
- `src/components/medications/MedicationsScreen.tsx` (dialog + focus trap, X `.tap-44`):
  aviso "não substitui a orientação do seu médico"; linha "Seu professor pode
  ver e editar esta lista" quando houver vínculo; seção Hoje com "Tomei"
  (dourado, ação primária) → "Tomado às 08:03" + Desfazer; verde só para tomado;
  sem vermelho/âmbar para atraso; seção Seus medicamentos (Ativo/Pausado,
  Editar, Excluir com confirm destrutivo); estado vazio em 1 linha.
- `MedicationForm.tsx` (compartilhado com o professor): nome, dose, horários
  (`input type=time` + "+ horário"), 7 chips de dia com `aria-pressed`,
  início/fim, observação escondida até pedir; `onSubmit → Promise<boolean>`
  (não fecha em falha). `MedicationTodayList.tsx`, `MedicationList.tsx`.
- Shell: `modalStore` (`medicationsOpen`), `HeaderActionsMenu` (item `Pill`
  depois de "Histórico de refeições"), `DashboardHeader` (repasse),
  `IronTracksAppClientImpl` (menu e `onPushNavigate` por tipo), `DashboardModals`.
- Professor: `src/components/admin-panel/StudentMedicationsTab.tsx` + pílula
  "Remédios" em `StudentDetailPanel.tsx`; adesão de 7 dias em texto.

## LGPD
`userDataCatalog.ts`: `medications` e `medication_intakes` com `cascade` e
`export: own(['user_id'])` (tomadas com teto 20000); snapshot 112 → 114 no teste.

## Testes (todos com prova por mutação)
`agenda.test.ts` (virada, dia da semana, início futuro, fim inclusivo, pausado,
`created_at`); `medicationReminders.test.ts` (mock que distingue tabela; **duas
doses no mesmo horário, só uma tomada**; dedupe; falha na leitura envia);
`medicationsRoutes.test.ts` (409 `dia_virou`); `teacherMedications.test.ts`
(403 em todos os métodos sem vínculo; `.eq('user_id')` em toda escrita);
`medicationsMigration.test.ts` (RLS, REVOKE anon, sem UPDATE em tomadas, FK
composta, `net.http_get` + `cron_secrets`); `notificacaoMedicamentos.test.tsx`
(TYPE_CONFIG/ROTEADOS/shell); testes de UI. Atualizar `coachChangeFiacao` e o
snapshot LGPD. RLS ao vivo em `scripts/rls-policies-smoke.test.ts` após M1.

## Blocos (arquivos disjuntos)
A base pura · B banco+LGPD → (paralelo) · C núcleo+rotas aluno · E cron+tipos ·
F UI aluno (dependem de A) → D rota professor (C,E) · G shell (F,E) → H painel professor (D,F).

## Não tocar
`middleware.ts`, auth, pagamentos, `vercel.json`, `sender.ts`/`apns.ts`/`ios/**`/
`capacitor.config.ts`, `janelaDeLembrete.ts`/`mealTimes.ts`/`meal-reminders`
(só import), migrations existentes, abas do dashboard, `types/supabase.ts`.

## Fora do escopo (tarefa à parte)
Migration `20260905082950_meal_reminders_pg_cron_fix_net_schema.sql` atrás de
produção; criação de `public.cron_secrets` não versionada.

## Decisões do dono (03/10/2026 — SUBSTITUEM as recomendações acima)
Aceitas todas as recomendações:
- **D1** Professor editou → avisa o aluno (`medication_updated`, janela de 30 min, mesmo toggle `notifyMedications`).
- **D2** Lembrete RESPEITA o "Não perturbar" (fica só no sino). Não tocar no `sender.ts`.
- **D3** Nome e dose aparecem no push (`💊 08:00 · Losartana · 50 mg`).
- **D4** Excluir remédio apaga as tomadas em cascata; a confirmação diz isso; "Pausar" é a alternativa.
- **D5** Professor NÃO marca "Tomei" (só o aluno); professor vê adesão de 7 dias em texto.
- **D6** "Tomei"/desfazer só para o dia BRT de hoje.
- **D7** Limites: 8 horários por remédio, 30 remédios por usuário (validar no Zod e no núcleo).
- **D8** Linha "Seu professor pode ver e editar esta lista." quando houver vínculo.
- Um push por (usuário, dia, horário) agrupando remédios. Sem badge/card fora da tela na v1.
- **Migrations autorizadas:** M1 antes do merge; M2 só depois do deploy da rota do cron.

## Contrato de API (fixado antes da onda 2 — C implementa, F e H consomem)
Todas as respostas JSON `{ ok: boolean, ... }`; erro `{ ok: false, error: '<codigo>' }`.
- `GET /api/medications` → `{ ok, medications: Medication[], intakes: MedicationIntake[] /* só de hoje BRT */, today: 'YYYY-MM-DD', hasCoach: boolean }`
  (`hasCoach` = existe linha em `students` com `user_id = eu` e `teacher_id` não nulo; falha na leitura → `false`).
- `POST /api/medications` body `MedicationInput` → `{ ok, medication }` · 409 `limite_atingido` acima de 30.
- `PATCH /api/medications` body `{ id, ...MedicationPatch }` → `{ ok, medication }` (confere `endDate >= startDate` contra a linha gravada).
- `DELETE /api/medications` body `{ id }` → `{ ok }`.
- `POST /api/medications/intakes` body `{ medicationId, time, dateKey }` → `{ ok, intake }` · 409 `dia_virou` se `dateKey` ≠ hoje BRT · 400 `horario_invalido` se `time` não está em `times` ou o remédio não vale hoje.
  ⚠️ Gravar por INSERT ignorando duplicata (`upsert(..., { onConflict: 'medication_id,date,scheduled_time', ignoreDuplicates: true })` ou insert tratando `23505` como sucesso e relendo a linha). NUNCA `ON CONFLICT DO UPDATE`: a tabela não tem policy de UPDATE.
- `DELETE /api/medications/intakes` body `{ medicationId, time, dateKey }` → `{ ok }` · 409 `dia_virou`.
- Professor: `GET /api/teacher/medications?studentId=` → `{ ok, medications, intakes /* últimos 7 dias BRT */ }`; `POST` `{ studentId, ...MedicationInput }`; `PATCH` `{ studentId, id, ...MedicationPatch }`; `DELETE` `{ studentId, id }`.
Corpo de DELETE vai em JSON (o repo lê por `parseJsonBody`).
