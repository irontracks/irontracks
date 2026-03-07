## Como seria (modelo + layout)

### 1) Modelo `reportData` (campos sugeridos)
- **Objetivo:** ter um objeto único que alimenta o HTML/PDF e também serve de “input confiável” para a IA (sem alucinar dados).

**Shape sugerido (TypeScript conceitual):**
- `meta`
  - `reportVersion` (string)
  - `generatedAt` (ISO string)
  - `locale` ('pt-BR')
  - `source` ('workout_session')
- `brand`
  - `appName` ('IronTracks')
  - `accentColor` ('#f59e0b')
  - `logoUrl`
- `athlete`
  - `id` (string | null)
  - `name` (string)
  - `coachName` (string | null)
  - `units` ('kg' | 'lb')
- `session`
  - `workoutId` (string | null)
  - `workoutTitle` (string)
  - `startAt` (ISO string | null)
  - `endAt` (ISO string | null)
  - `totalTimeSeconds` (number)
  - `realTimeSeconds` (number)
  - `status` ('completed' | 'partial')
  - `isTeamSession` (boolean)
  - `notes` (string | null)
- `summaryMetrics`
  - `exercisesCount` (number)
  - `exercisesLoggedCount` (number)
  - `setsLoggedCount` (number)
  - `repsTotal` (number)
  - `volumeTotal` (number) 
  - `volumeDeltaPctVsPrev` (number | null)
  - `topWeight` (number | null)
  - `caloriesEstimate` (number | null)
- `outdoorBike` (opcional)
  - `distanceKm`, `durationSeconds`, `avgSpeedKmh`, `maxSpeedKmh`, `caloriesKcal`
- `exercises[]`
  - `name`
  - `method` (string | null)
  - `rpe` (string | number | null)
  - `cadence` (string | null)
  - `baseLabel` (string | null) (ex: “Base: 12/01/26”)
  - `sets[]`
    - `index` (number)
    - `weight` (string | number | null)
    - `reps` (string | number | null)
    - `tag` ('Aquecimento' | 'Drop-set' | ... | null)
    - `note` (string | null)
    - `progression` (opcional)
      - `type` ('weight'|'reps'|'volume'|'none')
      - `deltaText` (string)
      - `direction` ('up'|'down'|'flat')
- `ai` (opcional, quando existir)
  - `summary` (string)
  - `motivation` (string | null)
  - `highlights[]` (string[])
  - `warnings[]` (string[])
  - `prs[]` ({ exercise: string; value: string }[])
  - `progression[]` ({ exercise: string; recommendation: string }[])

**Exemplo JSON compacto:**
- `summaryMetrics.volumeDeltaPctVsPrev` pode ser `null` se não houver treino anterior.
- `ai` pode ser `null` se a IA não foi gerada.

### 2) Layout de 2 páginas (o que entra em cada bloco)

**Página 1 — Visão executiva**
- **Header:** logo + “Relatório de Performance” + título do treino + data + aluno
- **Cards (linha 1):** Tempo total, Tempo real, Volume total + variação vs anterior
- **Cards (linha 2):** Séries + exercícios logados, Reps totais + top carga, Calorias estimadas, Status
- **Bloco IA (grid 2 colunas):**
  - “Insights da IA” (summary + motivação curta)
  - “Pontos fortes” (bullets)
  - “Alertas” (bullets)
  - “PRs” (bullets) e/ou “Progressão sugerida” (bullets)
- **Se Bike Outdoor (se existir):** mini-cards de distância/velocidades/tempo

**Página 2 — Execução do treino (detalhe)**
- Lista de exercícios em sequência, cada um com:
  - Título (badge número) + nome
  - Meta info (base, método, RPE)
  - Tabela de sets: Série | Carga | Reps | Cad | Evolução
  - Observações (quando houver)
- **Footer:** “IRONTRACKS • Página X/Y”

## Próximo passo (plano de implementação, se você quiser que eu materialize isso)
- Padronizar um `reportData` real (tipo/interface) e adaptar o gerador do relatório para montar esse objeto.
- Ajustar a IA para consumir `reportData` (ou um recorte `aiInput`) e retornar no mesmo schema.
- Usar esse `reportData` para render do HTML/PDF (e opcionalmente persistir para reuso).

Se aprovar, eu implemento o `reportData` como contrato e conecto o gerador do PDF/IA a ele.