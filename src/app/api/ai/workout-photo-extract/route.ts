/**
 * API: POST /api/ai/workout-photo-extract
 *
 * Lê os arquivos (foto/PDF) de uma ficha de treino do bucket PRIVADO
 * workout-imports e devolve os treinos estruturados, para o usuário revisar
 * antes de criar.
 *
 * Modelo: Flash. A tarefa é EXTRAÇÃO de documento (mesma família do
 * lab-exam-extract), não julgamento visual como a avaliação por foto — o Pro
 * custaria mais sem ler melhor um papel com letra de personal.
 *
 * Feature VIP (ou a primeira ficha grátis; o gate de entrada é o /create).
 * Rate limit: 5 req/min por usuário — chamada de visão é cara.
 *
 * ⚠️ O arquivo é APAGADO do bucket assim que a extração dá certo. A ficha é
 * insumo descartável e costuma ser a parte sensível (nome do aluno, telefone do
 * personal na margem, às vezes a ficha de outra pessoa na mesma folha).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkWorkoutImportAccess } from '@/utils/vip/workoutImportAccess'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { respondInternalError } from '@/utils/api/internalError'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { workoutPhotoGenerationConfig } from '@/utils/ai/routeContracts'
import { extractJsonFromModelText } from '@/utils/ai/extractJson'
import { normalizeExtractedWorkouts } from '@/utils/ai/workoutPhotoNormalize'
import { WorkoutPhotoExtractedSchema } from '@/schemas/workoutPhotoImport'
import { WORKOUT_IMPORT_MAX_FILE_BYTES } from '@/types/workoutPhotoImport'
import { logError, logWarn } from '@/lib/logger'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
// Ficha de várias páginas + Gemini lendo imagem passa fácil dos 30s padrão.
export const maxDuration = 120

const BUCKET = 'workout-imports'

const BodySchema = z.object({ importId: z.string().uuid() }).strip()

const PROMPT = [
  'Você está lendo uma FICHA DE TREINO de academia. Pode ser foto de papel escrito',
  'à mão, impressão, planilha ou print de outro aplicativo. Pode haver VÁRIAS',
  'páginas/arquivos representando dias diferentes do mesmo programa.',
  '',
  'TAREFA: identificar cada TREINO (dia) e extrair seus exercícios NA ORDEM em que',
  'aparecem.',
  '',
  'TÍTULO de cada treino: use o que estiver escrito ("Treino A", "A - Peito",',
  '"Segunda - Superior"). Se não houver título, infira algo curto pelo grupo',
  'muscular predominante ("Peito e tríceps"). Nunca invente letra/dia que não está',
  'na ficha.',
  '',
  'Para cada EXERCÍCIO, capture só o que estiver escrito:',
  '- name: o nome como está na ficha (mesmo abreviado — a padronização é feita depois)',
  '- sets: número de séries',
  '- reps: TEXTO, preservando a faixa ("8-12", "10", "até a falha", "20/lado")',
  '- weightKg: carga em kg, quando anotada',
  '- rpe: percepção de esforço 1-10, quando anotada',
  '- cadence: cadência tipo "3-1-1", quando anotada',
  '- restSeconds: descanso em SEGUNDOS (converta "1min30" → 90, "2\'" → 120)',
  '- method: só quando a ficha indicar claramente a técnica —',
  '  "drop_set" (drop-set/série descendente), "rest_pause" (rest-pause/SST),',
  '  "super_set" (bi-set/super-set), "cluster", "giant_set" (giant/tri-set).',
  '  Na dúvida use "normal".',
  '- notes: observação técnica que estiver escrita (ex.: "só na última série",',
  '  "unilateral", "até a falha"). Não repita aqui o que já foi para os outros campos.',
  '',
  'REGRAS DURAS:',
  '1. NÃO INVENTE. Campo que a ficha não traz fica null. É muito melhor null do que',
  '   um número plausível que não está no papel — o usuário confia no que aparece.',
  '2. Não acrescente exercícios "que fariam sentido". Só o que está escrito.',
  '3. Letra manuscrita ambígua: escolha a leitura mais provável no contexto de',
  '   academia (números são números; "3x10" é 3 séries de 10).',
  '4. Aquecimento/cardio escrito na ficha entra como exercício normal.',
  '5. Se a imagem não for uma ficha de treino (ou estiver ilegível), devolva',
  '   "workouts": [] — em vez de tentar adivinhar.',
].join('\n')

export async function POST(request: Request) {
  const admin = createAdminClient()
  let importId = ''

  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`ai:workout-photo-extract:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkWorkoutImportAccess(auth.supabase, userId, 'process')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const parsed = await parseJsonBody(request, BodySchema)
    if (parsed.response) return parsed.response
    importId = parsed.data!.importId

    const { data: imp } = await admin
      .from('workout_photo_imports')
      .select('id, user_id')
      .eq('id', importId)
      .maybeSingle()
    if (!imp) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (String(imp.user_id) !== userId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const apiKey = String(env.gemini.apiKey || '').trim()
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const { data: files } = await admin
      .from('workout_photo_import_files')
      .select('id, storage_path, mime_type')
      .eq('import_id', importId)
      .is('purged_at', null)
      .order('created_at', { ascending: true })

    const list = Array.isArray(files) ? files : []
    if (!list.length) return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 })

    await admin.from('workout_photo_imports').update({ status: 'extracting' }).eq('id', importId)

    // Baixa e converte cada página para inlineData base64 (mesmo caminho do
    // lab-exam-extract; o bucket é privado, então nunca por URL pública).
    const fileParts: Part[] = []
    for (const f of list) {
      const path = String(f.storage_path || '')
      if (!path) continue
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
      if (dlErr || !blob) {
        logWarn('workout-photo-extract', 'download falhou', { path, error: dlErr?.message })
        continue
      }
      if (blob.size > WORKOUT_IMPORT_MAX_FILE_BYTES) continue
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      fileParts.push({
        inlineData: { mimeType: String(f.mime_type || 'image/jpeg'), data: base64 },
      })
    }

    if (!fileParts.length) {
      await failImport(admin, importId, 'Não consegui abrir os arquivos enviados.')
      return NextResponse.json({ ok: false, error: 'files_unreadable' }, { status: 400 })
    }

    const modelId = env.gemini.fastModelId
    const model = getGeminiModel(apiKey, modelId, workoutPhotoGenerationConfig())
    const parts: Part[] = [{ text: PROMPT }, ...fileParts]
    const gen = await safeGemini('workout-photo-extract', () => model.generateContent(parts))
    if ('errorResponse' in gen) {
      await failImport(admin, importId, 'A leitura da ficha falhou. Tente de novo.')
      return gen.errorResponse
    }

    const raw = extractJsonFromModelText(gen.value?.response?.text?.() || '')
    const normalized = normalizeExtractedWorkouts(raw)
    const validated = WorkoutPhotoExtractedSchema.safeParse(normalized)

    if (!validated.success || !validated.data.workouts.length) {
      // Sem treino legível não é erro de sistema: é a ficha que não deu. A
      // mensagem diz o que fazer, em vez de culpar o usuário.
      await failImport(admin, importId, 'Não consegui identificar exercícios nesta imagem.')
      return NextResponse.json(
        {
          ok: false,
          error: 'nothing_extracted',
          message: 'Não consegui identificar exercícios nesta imagem. Tente uma foto mais nítida, com a ficha inteira enquadrada e boa iluminação.',
        },
        { status: 422 },
      )
    }

    await admin
      .from('workout_photo_imports')
      .update({
        status: 'extracted',
        extracted_workouts: validated.data,
        ai_model: modelId,
        ai_extracted_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', importId)

    // Deu certo → a foto não serve mais para nada e é o pedaço sensível.
    void purgeFiles(admin, importId, list.map((f) => String(f.storage_path || '')).filter(Boolean))

    return NextResponse.json({ ok: true, importId, workouts: validated.data.workouts })
  } catch (e: unknown) {
    if (importId) await failImport(admin, importId, 'Erro inesperado ao ler a ficha.').catch(() => {})
    return respondInternalError('api:ai:workout-photo-extract', e)
  }
}

type Admin = ReturnType<typeof createAdminClient>

async function failImport(admin: Admin, importId: string, message: string) {
  try {
    await admin
      .from('workout_photo_imports')
      .update({ status: 'failed', error_message: message })
      .eq('id', importId)
  } catch (e) {
    logError('workout-photo-extract:fail-update', e, { importId })
  }
}

/**
 * Apaga os arquivos do bucket e carimba purged_at. Best-effort: se falhar, o
 * usuário já tem o treino — o que não pode é a falha da limpeza derrubar a
 * resposta de sucesso.
 */
async function purgeFiles(admin: Admin, importId: string, paths: string[]) {
  if (!paths.length) return
  try {
    await admin.storage.from(BUCKET).remove(paths)
    await admin
      .from('workout_photo_import_files')
      .update({ purged_at: new Date().toISOString() })
      .eq('import_id', importId)
  } catch (e) {
    logWarn('workout-photo-extract', 'purge falhou', { importId, error: String(e) })
  }
}
