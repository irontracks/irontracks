# Importar treino por Foto/PDF — Design Spec

**Data:** 2026-08-19
**Autor:** Maicon + Claude (Sonnet — pesquisa/desenho; implementação pede Opus)
**Status:** Pronto para implementação — aguardando sinal do dono
**Escopo:** Feature nova. Não existe hoje nenhum caminho de import por imagem/PDF no app (confirmado por busca no repo inteiro).

---

## 1. Objetivo

O usuário tira foto (ou sobe PDF/imagem) de uma ficha de treino — escrita à mão pelo personal, impressa, ou um print de outro app — e o IronTracks extrai os exercícios, séries, reps, peso e método, monta um ou mais treinos e deixa o usuário revisar antes de salvar.

Ponto de entrada: 4º card no Step 0 do `WorkoutWizardModal`, ao lado de "Criar Manualmente" / "IA Automática" / "Por Voz".

## 2. Por que este desenho — o que já existe e o que é novo

A investigação (ver Apêndice A) achou **dois "produtos irmãos" já em produção** que juntos cobrem quase toda a arquitetura necessária:

| Peça | Doador | O que reaproveita |
|---|---|---|
| Upload de arquivo (PDF+imagem misto, bucket privado, signed URL) | `lab-exams` (`create` → `signed-upload` → `extract`) | Fluxo de 3 rotas inteiro, só troca o domínio |
| Envio pro Gemini como `inlineData` base64, mimeType dinâmico | `lab-exam-extract/route.ts` | Loop de download+encode, `maxDuration=120`, `MAX_FILE_BYTES` |
| Contrato de saída por exercício (nome, sets, reps, peso, rpe, método, cadência, descanso — tudo anulável) | `parse-exercise-voice` + `VOICE_EXERCISES_RESPONSE_SCHEMA` | O shape inteiro, só precisa virar array-de-treinos em vez de array-de-exercícios solto |
| UI de revisão por exercício | `VoiceWorkoutModal.tsx` | Padrão de card editável — generalizar para multi-treino |
| Persistência (criar N treinos de um payload) | `importData()` em `workout-crud-actions.ts:213` | **Zero código novo** — o formato de saída já pode ser `{ workouts: [...] }` |
| Padrão "VIP ou 1º grátis" | `checkLabExamsAccess` | Copiar o padrão, tabela nova |

**O que é genuinamente novo**: (1) o schema precisa suportar VÁRIOS treinos numa ficha só (a foto normalmente mostra "Treino A, B, C" numa tabela ou várias páginas — `parse-exercise-voice` só extrai exercícios soltos de UM treino); (2) a UI de revisão precisa navegar entre treinos, não só entre exercícios; (3) decisão de custo/gating (seção 6).

## 3. Fluxo ponta a ponta

```
WorkoutWizardModal (Step 0)
  └─ [📷 Por Foto/PDF] → abre WorkoutPhotoImportModal
       ├─ 1. Seleção: dropzone + <input type="file" accept="application/pdf,image/*" multiple>
       │      (mesmo padrão de LabExamUploadModal.tsx:159-163; iOS/Android abrem
       │      o seletor nativo — câmera/galeria/arquivos — sem componente dedicado)
       ├─ 2. Compressão client-side (só imagens; PDF passa direto)
       │      reusa compressBodyPhoto() ou uma variante — 1080px/JPEG 0.85 é
       │      suficiente pra OCR de texto manuscrito, testar se preserva legibilidade
       ├─ 3. POST /api/workout-photo-import/create
       │      → cria registro (status=pending), checa gate de acesso
       ├─ 4. Upload direto pro Storage via signed URL
       │      POST /api/workout-photo-import/signed-upload (por arquivo)
       │      → supabase.storage.from('workout-imports').uploadToSignedUrl(...)
       ├─ 5. POST /api/ai/workout-photo-extract { importId }
       │      → baixa arquivos do bucket (admin client), monta Part[] com
       │        inlineData base64 + mimeType dinâmico, chama Gemini Flash
       │        com responseSchema, normaliza nomes via resolveCanonicalExerciseName
       │      → grava resultado em workout_photo_imports.extracted_workouts
       │      → devolve { workouts: [{ title, exercises: [...] }] }
       ├─ 6. Tela de revisão (nova, multi-treino)
       │      → abas ou lista expansível por treino extraído
       │      → cada exercício editável (nome, sets, reps, peso, rpe, método)
       │      → exercício/treino removível; nome canonizado mostrado com
       │        indicador sutil quando mudou ("Supino Retão" → "Supino reto")
       └─ 7. Confirmar → importData({ workouts: draftsEditados })
              (função já existente, chama createWorkout() por treino)
              → fecha modal, fetchWorkouts(), toast de sucesso
```

## 4. Banco de dados — nova tabela

Segue o padrão de `lab_exams` (registro de sessão + status), não o padrão efêmero (extrair e esquecer), porque:
- extração pode passar de 30s (Vercel serverless timeout) → precisa existir ANTES de a extração terminar, para o client dar polling/retry;
- upload multi-arquivo por signed URL exige um `id` para agrupar os arquivos antes da extração;
- guardar por um tempo permite "tentar de novo" sem reupload se o Gemini falhar.

```sql
create table workout_photo_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'extracting', 'extracted', 'failed')),
  extracted_workouts jsonb,        -- { workouts: [{ title, exercises: [...] }] }
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workout_photo_import_files (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references workout_photo_imports(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);
```

RLS: `user_id = auth.uid()` em ambas (leitura/escrita), sem fluxo de personal/aluno nesta v1 — diferente do lab-exams, aqui não há necessidade óbvia de um personal montar treino do aluno por foto (o personal já monta pelo editor). **Confirmar com o dono se há caso de uso disso** — se não, mantém simples.

**Limpeza**: os arquivos originais (foto da ficha) não têm valor depois que o treino foi importado — diferente de exame laboratorial, que o usuário quer guardar. Duas opções: (a) cron de limpeza que apaga `storage_path` + linha depois de N dias; (b) apagar o arquivo do Storage assim que `status='extracted'` com sucesso, mantendo só o JSON extraído por um tempo (auditoria/debug). **Recomendo (b)** — é dado sensível (a ficha pode ter nome de outra pessoa, telefone do personal escrito na margem, etc.) e não precisa sobreviver ao sucesso da extração.

## 5. Bucket de Storage

Novo bucket **privado** `workout-imports` (nunca Cloudinary — Cloudinary é para mídia pública como avatar/stories; ver Apêndice A §3). Mesmo padrão RLS de `body-photos`/`lab-exams`: signed URL de upload gerada por rota autenticada, download só via admin client no servidor.

## 6. Rota de extração — `POST /api/ai/workout-photo-extract`

Segue o esqueleto de `lab-exam-extract/route.ts` linha por linha:

```ts
export const dynamic = 'force-dynamic'
export const maxDuration = 120 // ficha com várias páginas / foto grande

const BUCKET = 'workout-imports'
const MAX_FILE_BYTES = 15 * 1024 * 1024 // fotos de celular raramente passam de 8-10MB

async function POST(req) {
  const auth = await requireUser(); if (!auth.ok) return auth.response
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`ai:workout-photo-extract:${userId}:${ip}`, 5, 60_000)
  if (!rl.allowed) return 429

  // GATE — ver seção 7, decisão pendente
  const access = await checkWorkoutPhotoImportAccess(supabase, userId, 'process')
  if (!access.allowed) return 403 vip_required

  const { importId } = parseJsonBody(...)
  // busca workout_photo_import_files do importId, valida ownership
  // baixa cada arquivo do bucket, base64, monta Part[] com inlineData
  // (mimeType dinâmico: image/jpeg | image/png | application/pdf | image/heic)

  const model = getGeminiModel(env.gemini.apiKey, env.gemini.fastModelId, workoutPhotoGenerationConfig())
  const result = await safeGemini('workout-photo-extract', () => model.generateContent({
    contents: [{ role: 'user', parts: [{ text: PROMPT }, ...fileParts] }],
  }))
  if (result.errorResponse) return result.errorResponse

  const raw = extractJsonFromModelText(result.value.text())
  const normalized = normalizeExtractedWorkouts(raw) // coerce.ts pattern: trunca, não rejeita
  const parsed = WorkoutPhotoExtractSchema.safeParse(normalized) // Zod é o juiz final
  if (!parsed.success) → grava status=failed, devolve erro amigável

  // canoniza nome de cada exercício
  parsed.data.workouts.forEach(w => w.exercises.forEach(ex => {
    const canon = resolveCanonicalExerciseName(ex.name)
    if (canon.changed) ex.name = canon.canonical
  }))

  grava extracted_workouts, status='extracted'
  apaga arquivos do bucket (ver seção 4)
  devolve { ok: true, workouts: parsed.data.workouts }
}
```

### Schema de saída (Zod + espelho `responseSchema`)

Diferença chave em relação a `parse-exercise-voice`: array de TREINOS, cada um com array de exercícios. Reaproveita o shape de exercício quase 1:1 do `VOICE_EXERCISES_RESPONSE_SCHEMA` (`routeContracts.ts:25-50`), envolvido numa camada de treino:

```ts
const WorkoutPhotoExerciseSchema = z.object({
  name: z.string().min(1).max(120),
  sets: z.number().int().nullable(),
  reps: z.string().max(20).nullable(),      // "8-12" ou "10" — texto, não int
                                              // (ficha real mistura faixa e valor fixo)
  weightKg: z.number().nullable(),
  cadence: z.string().max(20).nullable(),
  restSeconds: z.number().int().nullable(),
  rpe: z.number().nullable(),
  method: z.enum(['normal','drop_set','rest_pause','super_set','cluster','giant_set']).nullable(),
  notes: z.string().max(200).nullable(),
})

const WorkoutPhotoWorkoutSchema = z.object({
  title: z.string().max(80),                // "Treino A - Peito", inferido ou lido
  exercises: z.array(WorkoutPhotoExerciseSchema).max(25),
})

const WorkoutPhotoExtractSchema = z.object({
  workouts: z.array(WorkoutPhotoWorkoutSchema).max(7), // ficha semanal raramente passa de 7
})
```

`reps` como STRING é uma escolha deliberada, diferente da voz (`reps: number`): ficha escrita à mão mistura `"8-12"`, `"até a falha"`, `"10"` — forçar `number` perderia a faixa, que é informação real do treino. `createWorkout`/`buildExercisesPayload` já aceita `reps` como string no formato header (Apêndice A §4).

### Prompt (rascunho, ajustar depois de testar com fichas reais)

```
Você está lendo uma FICHA DE TREINO — pode ser foto de papel escrito à mão,
impressão, ou print de outro app. Pode haver várias PÁGINAS/ARQUIVOS
representando dias diferentes (Treino A, B, C...) do mesmo programa.

TAREFA: para cada treino/dia identificado, extraia o TÍTULO (se houver "Treino
A - Peito", "Segunda - Superior" etc; senão infira algo curto pelo grupo
muscular predominante) e a lista de exercícios NA ORDEM em que aparecem.

Para cada exercício, capture o que estiver escrito: séries, repetições
(preserve faixas como "8-12"), carga em kg, RPE/percepção de esforço,
cadência, tempo de descanso, método (rest-pause, drop-set, bi-set/super-set,
cluster, giant-set — só marque se houver indicação clara no papel) e qualquer
observação técnica.

NÃO INVENTE dado que não está escrito — campo ausente fica null. Letra
manuscrita ambígua: prefira a leitura mais provável para um contexto de
academia (números, não palavras aleatórias).

Se o mesmo exercício aparecer abreviado (ex: "Supino Retão", "RDL"), mantenha
o nome como está escrito — a canonização acontece depois, fora do seu escopo.
```

### Modelo e custo

`env.gemini.fastModelId` (Flash), seguindo a mesma lógica que classificou `lab-exam-extract` como extração-de-documento e não julgamento-visual (Apêndice A §7). `thinkingBudget: 0` automático (já é o comportamento de `getGeminiModel` para modelos flash). Sem fallback heurístico — se o Gemini falhar, a tela de erro oferece "Tentar de novo" ou "Criar manualmente", nunca inventa um treino vazio.

## 7. Decisão pendente — gating (dono precisa escolher antes da implementação)

Duas opções, no padrão já usado no app:

**(a) VIP + 1 grátis** (clonar `checkLabExamsAccess`): a ideia que já funciona para exames — free vê o valor uma vez, decide assinar. Cabe bem aqui: ler foto de ficha é trabalho manual chato, é um bom gancho de conversão.

**(b) VIP puro, sem grátis**: mais simples, mas sem demonstração — ninguém experimenta antes de pagar.

Recomendo **(a)**, pelo precedente e pela lógica do comentário original: *"ninguém compra o que nunca provou"*. Mas é decisão de produto, não técnica — perguntar ao dono antes de implementar o gate.

**Custo por chamada**: cada extração manda 1-7 imagens/PDFs de uma vez pro Gemini Flash — mais caro que uma chamada de texto puro, mas na mesma ordem de grandeza de `lab-exam-extract`, que já roda em produção sem alarme de custo. Não há necessidade de alertar o dono além do que o `CLAUDE.md` já registra ("cada chamada custa dinheiro").

## 8. UI — o que precisa ser desenhado (novo, sem doador direto)

`VoiceWorkoutModal` revisa exercícios de UM treino. Aqui são N treinos. Esqueleto sugerido para `WorkoutPhotoImportModal.tsx`:

- **Estado da máquina**: `select → uploading → extracting → review → saving → done | error`
- **Tela de seleção**: dropzone (clique ou arrastar no desktop; no mobile abre o seletor nativo), lista de arquivos escolhidos com miniatura + botão remover, CTA "Extrair treino(s)"
- **Tela de progresso**: nomeada por etapa ("Enviando arquivos…" → "Lendo sua ficha…"), sem número de porcentagem fake
- **Tela de revisão**: abas horizontais por treino extraído (rótulo = título editável), dentro de cada aba a lista de exercícios no MESMO componente de card que `VoiceWorkoutModal` usa (extrair para componente compartilhado `ExerciseDraftCard` se ainda não for compartilhável) — permitir reordenar, remover exercício, remover treino inteiro, editar qualquer campo
- **Erro**: mensagem amigável + "Tentar de novo" (reusa o mesmo `importId`, não força reupload) + "Criar manualmente" (fecha e abre o Step 0 no modo manual)

## 9. Ponto de entrada — `WorkoutWizardModal.tsx`

Card novo no Step 0 (`WorkoutWizardModal.tsx:427-502`), mesmo padrão visual de "Por Voz" (linha 470-491): botão full-width abaixo do grid Manual/IA, ícone 📷, label "Por Foto/PDF", subtítulo "Fotografe sua ficha e a IA estrutura pra você". `onClick` abre `WorkoutPhotoImportModal` via `dynamic()` sem SSR (mesmo padrão de `VoiceWorkoutModal`, linha 10 — evita carregar a lógica de upload/IA em quem nunca usa a feature).

## 10. Testes/guards que a implementação vai precisar (não escrever agora, só mapear)

- Schema Zod ↔ `responseSchema` em paridade (padrão já cobrado por guard em outras rotas de IA — conferir `structuredOutputRatchet.test.ts`, mencionado no `CLAUDE.md` do projeto, e adicionar esta rota nele)
- `resolveCanonicalExerciseName` realmente aplicado antes de `createWorkout` (source-guard, como outros pipelines de nome)
- RLS das duas tabelas novas (`get_advisors` depois de aplicar a migration)
- Limite de arquivos/tamanho respeitado (teste unitário da validação)
- Apagar arquivo do bucket após sucesso — não deixar ficha sensível órfã no Storage

## 11. O que fica FORA do escopo desta v1 (dizer isso é parte de entregar bem)

- Fluxo personal→aluno (só autoavaliação por enquanto, salvo decisão em contrário)
- OCR de tabela complexa com múltiplas colunas de progressão semanal (semana 1/2/3/4 com cargas diferentes) — a extração pega a carga mais recente/única; progressão por semana é edição manual depois
- Detecção automática de qual dia da semana cada treino representa (o usuário nomeia/ordena na revisão, como já faz hoje ao criar manualmente)

---

## Apêndice A — Notas da investigação (arquivos e linhas citados)

Ver o relatório completo do agente de pesquisa nesta sessão para o texto integral com todos os caminhos. Resumo dos pontos mais usados neste desenho:

- Padrão de rota IA com structured output: `exercise-muscle-map/route.ts`, `lab-exam-extract/route.ts`, `body-composition-photo/route.ts`
- Envio de imagem/PDF ao Gemini via `inlineData` base64: `body-composition-photo/route.ts:142-151`, `lab-exam-extract/route.ts:148-160`
- Upload client→Storage via signed URL: `utils/storage/labExamUpload.ts`, `utils/storage/bodyPhotoUpload.ts`
- `createWorkout`/`buildExercisesPayload`: `actions/workout-crud-actions.ts:36-84,88`
- `importData` pronto para uso: `actions/workout-crud-actions.ts:213-229`
- Contrato de exercício por voz: `components/dashboard/VoiceWorkoutModal.tsx:52-63`, `utils/ai/routeContracts.ts:25-53`
- Canonização de nome: `utils/exerciseCanonical.ts:220-229`
- Entry point do wizard: `components/dashboard/WorkoutWizardModal.tsx:427-502`
- Padrão "VIP ou 1º grátis": `utils/vip/labExamsAccess.ts`, `app/api/lab-exams/create/route.ts`
- Escolha de modelo (Flash vs Pro): `utils/env.ts:46-58`, comentários em `lab-exam-extract/route.ts:166`, `body-composition-photo/route.ts:11,162`

## Apêndice B — Ordem de implementação sugerida (para quando o dono trocar pro Opus)

1. Migration: as duas tabelas + RLS + bucket `workout-imports`
2. Rota `POST /api/workout-photo-import/create` + `signed-upload` (clone raso de lab-exams)
3. Schema Zod + `responseSchema` espelho + prompt (seção 6) — testar ISOLADO contra 3-4 fotos reais de ficha antes de plugar na UI (medir taxa de acerto, ajustar prompt)
4. Rota `POST /api/ai/workout-photo-extract`
5. `WorkoutPhotoImportModal.tsx` — telas select/uploading/extracting
6. Tela de revisão multi-treino (a peça sem doador direto — maior esforço de UI)
7. Ligar ao Step 0 do `WorkoutWizardModal`
8. Guards de teste (seção 10) + `get_advisors`
9. Decisão de gating (seção 7) implementada por último, fácil de trocar
