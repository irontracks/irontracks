# Mapa de dados — Histórico de treino & evolução de carga (IronTracks)

> Nota para o Claude (e humanos): onde ficam os valores de treino no Supabase.
> Criado em 2026-06-30 depois de uma exploração cara. Reuse isto em vez de
> redescobrir o schema. **Não confie nas tabelas normalizadas para sessões
> concluídas — o dado real está no JSON de `workouts.notes`.**

## Projeto / IDs
- **Supabase project_id (MCP):** `enbueukmvgodngydkpzm` (nome do projeto: "IronTrack").
- **User IDs de referência:**
  - `djmkapple` / MK (dono do app): `d04bfcef-54ea-4360-9e3d-e174a9ace503`
  - `frankokott` / Fran: `559c844f-96ac-4d3a-ab7b-1651263b4d94`
  - `djpopson`: `8dd0cd46-25e5-47e5-83b3-ff0ca7eb76a2`

## Onde está cada coisa
| Dado | Onde | Observações |
|---|---|---|
| **Programa atual (templates)** | `workouts` (is_template=true) → `exercises` → `sets` | `sets.weight` é **NULL** aqui; guarda só faixa de reps (prescrição). `exercises.notes` = descrição do exercício. |
| **Sessões concluídas** | `workouts` (is_template=false, `completed_at` NOT NULL) | ⚠️ **NÃO têm linhas em `exercises`/`sets`.** O log fica no JSON abaixo. |
| **Log real por série (peso/reps/rpe)** | **`workouts.notes`** (text com JSON) | Ver estrutura abaixo. É a fonte da tela "Histórico" e do story composer. |
| **Composição corporal** | `assessments` (60 colunas) | weight, body_fat_percentage, lean_mass, circunferências, bmi, etc. |
| **Check-ins pré/pós** | `workout_checkins` | energy, mood, soreness, sleep_hours, weight_kg, `answers` jsonb. NÃO tem carga por série. |
| Tabelas que parecem certas mas estão vazias/quase | `workout_set_logs`, `workout_session_logs`, `sets_audit` | Feature nova, praticamente sem dados (30 / 1 / 0 linhas). **Ignorar.** |

## Estrutura do JSON em `workouts.notes` (sessão concluída)
```jsonc
{
  "workoutTitle": "TER · Upper A — Costas + Ombro",
  "date": "2026-06-30T11:11:01Z",
  "exercises": [ { "name": "Puxada na frente", "sets": 4, "setDetails": [ { "set_number":1, "reps":"10-12", "weight": null, ... } ] } ],
  // ↓↓↓ AQUI ficam os pesos REALMENTE levantados ↓↓↓
  "logs": {
    "0-0": { "weight":"52", "reps":"10", "rpe":"5", "done":true, ... },  // chave = "exIdx-setIdx"
    "0-1": { "weight":"79", "reps":"12", "done":true, ... }
  },
  "totalTime": ..., "preCheckin": {...}, "postCheckin": {...}, "reportMeta": {...}
}
```
- **Nome do exercício** = `exercises[exIdx].name`; casar pelo índice do array com o `exIdx` da chave de `logs`.
- `setDetails[].weight` costuma ser `null` (é o planejado). O peso real está SÓ em `logs`.
- **1RM estimado (como o app mostra)** = Epley: `weight * (1 + reps/30)`. Ex.: 92kg×12 → 128,8kg.
- Nomes de exercício mudam quando o usuário troca de programa (ex.: MK trocou ~20/abr/2026; "Leg Press 45º" com º vs "Leg press 45°" com ° são o mesmo, eras diferentes).

## SQL pronto — evolução de carga por exercício (top set/dia, início→atual)
```sql
WITH sess AS (
  SELECT w.id AS sid, w.completed_at::date AS dia, w.notes::jsonb AS j
  FROM public.workouts w
  WHERE w.user_id = :USER_ID
    AND w.is_template=false AND w.completed_at IS NOT NULL AND left(btrim(w.notes),1)='{'
),
exs AS (
  SELECT sid, dia, (e.ord-1) AS exidx,
         lower(btrim(e.exj->>'name')) AS ex_norm, e.exj->>'name' AS ex_name
  FROM sess, jsonb_array_elements(j->'exercises') WITH ORDINALITY AS e(exj, ord)
),
lg AS (
  SELECT sid, dia, split_part(l.k,'-',1)::int AS exidx,
         (l.v->>'weight') AS wtxt, (l.v->>'reps') AS rtxt, (l.v->>'done') AS done
  FROM sess, jsonb_each(j->'logs') AS l(k,v)
),
joined AS (
  SELECT lg.dia, exs.ex_norm, exs.ex_name, (lg.wtxt)::numeric AS w,
         NULLIF(regexp_replace(lg.rtxt,'[^0-9].*$',''),'')::numeric AS reps
  FROM lg JOIN exs ON exs.sid=lg.sid AND exs.exidx=lg.exidx
  WHERE lg.done='true' AND lg.wtxt ~ '^[0-9]+(\.[0-9]+)?$' AND (lg.wtxt)::numeric>0
),
perday AS (
  SELECT ex_norm, dia, max(w) AS top_w, max(w*(1+coalesce(reps,10)/30.0)) AS best_e1rm
  FROM joined GROUP BY ex_norm, dia
),
names AS (SELECT ex_norm, max(ex_name) AS ex_name FROM joined GROUP BY ex_norm)
SELECT n.ex_name, count(*) sessoes, min(p.dia) inicio, max(p.dia) fim,
       (array_agg(p.top_w ORDER BY p.dia))[1] carga_ini,
       (array_agg(p.top_w ORDER BY p.dia DESC))[1] carga_atual,
       max(p.top_w) recorde
FROM perday p JOIN names n USING (ex_norm)
GROUP BY n.ex_name HAVING count(*) >= 4
ORDER BY carga_atual DESC;
```
Trocar `:USER_ID` pelo UUID. Filtre por janela de data (`w.completed_at >= '2026-04-20'`) para analisar só o programa atual.
