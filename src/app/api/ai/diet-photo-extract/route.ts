/**
 * POST /api/ai/diet-photo-extract
 *
 * Recebe a foto ou o PDF da dieta do nutricionista (multipart) e devolve o
 * MESMO JSON que o import por texto já sabe ler.
 *
 * O desenho é esse de propósito: a saída da IA cai em `importarDietaDeJson`,
 * então toda a tolerância que já existe (chaves em português, "120g", unidades,
 * macros derivados da base local, tetos do BodySchema) vale aqui de graça. A IA
 * só faz o que só ela pode fazer — ler o papel.
 *
 * ⚠️ Aqui SE PAGA por chamada, e é por isso que existe gate (VIP, com a
 * primeira por nossa conta). O import por JSON continua livre: lá o trabalho é
 * do assistente que o usuário já usa, e o app não gasta nada.
 *
 * Multipart direto, sem bucket — o padrão do `scan-nutrition-label`. O import
 * de TREINO usa bucket porque guarda a foto para reprocessar; aqui o arquivo é
 * lido e descartado, e uma dieta em PDF cabe folgada no limite.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { checkDietImportAccess, ACAO_IMPORT_DIETA } from '@/utils/vip/dietImportAccess'
import { createAdminClient } from '@/utils/supabase/admin'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeJsonParse, repairJsonText, stripCodeFence } from '@/utils/ai/extractJson'
import { logError } from '@/lib/logger'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** PDF de dieta costuma ter 1–3 páginas; 15 MB cobre foto de celular também. */
const MAX_BYTES = 15 * 1024 * 1024

const MIMES_ACEITOS = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]

function resolverMime(file: File): string {
    const declarado = String(file.type || '').toLowerCase()
    if (MIMES_ACEITOS.includes(declarado)) return declarado
    const ext = file.name?.split('.').pop()?.toLowerCase()
    const mapa: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    }
    return mapa[ext ?? ''] || ''
}

const PROMPT = [
    'Você lê dietas de nutricionistas brasileiros e as converte em JSON.',
    '',
    'Extraia TODAS as refeições com TODOS os alimentos e quantidades que o documento mostra.',
    '',
    'REGRAS:',
    '- Use gramas em "grams". Se o documento disser unidades ("2 ovos", "1 fatia"), escreva o alimento normalmente e ponha 0 em grams — o app converte.',
    '- Macros (calories/protein/carbs/fat): copie SÓ se o documento os traz. Se não traz, use 0 — o app calcula pela tabela nutricional dele.',
    '- NÃO invente alimento, quantidade nem macro que não esteja no documento.',
    '- Se a dieta tem dias diferentes da semana, use "days" com "weekday" (0=domingo, 1=segunda … 6=sábado). Se é um cardápio único, use "meals".',
    '- "time" é o horário da refeição, se o documento indicar.',
    '- Responda APENAS com o JSON, sem texto em volta e sem crases.',
    '',
    'Formato:',
    '{"planName":"...","meals":[{"name":"Café da manhã","time":"07:00","items":[{"food":"Ovo mexido","grams":120,"calories":0,"protein":0,"carbs":0,"fat":0}]}]}',
].join('\n')

/** Contrato na CHAMADA — o padrão do repo desde o lote de 02/08/2026. */
const ITEM = {
    type: 'object',
    properties: {
        food: { type: 'string' },
        grams: { type: 'number' },
        calories: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
    },
    required: ['food'],
} as const

const REFEICAO = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        time: { type: 'string' },
        items: { type: 'array', items: ITEM },
    },
    required: ['name', 'items'],
} as const

const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        planName: { type: 'string' },
        meals: { type: 'array', items: REFEICAO },
        days: {
            type: 'array',
            items: {
                type: 'object',
                properties: { weekday: { type: 'number' }, meals: { type: 'array', items: REFEICAO } },
                required: ['meals'],
            },
        },
    },
} as const

export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`ai:diet-photo:${userId}:${ip}`, 6, 3_600_000)
        if (!rl.allowed) {
            return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
        }

        // Gate ANTES de ler o arquivo: travar depois do upload gastaria banda do
        // usuário para negar em seguida — a mesma razão pela qual o import de
        // treino põe o gate na porta de entrada.
        const acesso = await checkDietImportAccess(auth.supabase, userId)
        if (!acesso.allowed) {
            return NextResponse.json({
                ok: false,
                error: 'vip_required',
                message: 'A primeira dieta foi por nossa conta — importar mais por foto é exclusivo para assinantes VIP. Por JSON continua livre.',
            }, { status: 403 })
        }

        const formData = await req.formData()
        const file = formData.get('file')
        if (!(file instanceof File)) {
            return NextResponse.json({ ok: false, error: 'no_file' }, { status: 400 })
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 })
        }
        const mimeType = resolverMime(file)
        if (!mimeType) {
            return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 })
        }

        if (!env.gemini.apiKey) {
            return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })
        }

        const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
        const model = getGeminiModel(env.gemini.apiKey, env.gemini.modelId, {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
            temperature: 0.1,
        })
        const resp = await model.generateContent([
            { text: PROMPT },
            { inlineData: { mimeType, data: base64 } },
        ])
        // `repairJsonText` é fonte única do reparo de JSON quebrado no repo —
        // o structured output derruba isso a quase zero, mas o custo de tentar
        // é nulo e a alternativa é o usuário rever o "não consegui ler".
        const bruto = resp.response.text()
        const json = safeJsonParse(repairJsonText(stripCodeFence(bruto)))
        if (!json) {
            return NextResponse.json({ ok: false, error: 'could_not_read' }, { status: 422 })
        }

        // Registra DEPOIS do sucesso: extração que falhou não pode consumir a
        // demonstração gratuita do usuário.
        try {
            await createAdminClient().from('audit_events').insert({
                action: ACAO_IMPORT_DIETA,
                entity_id: userId,
                metadata: { reason: acesso.reason, mime: mimeType, bytes: file.size },
            })
        } catch (e) {
            logError('ai:diet-photo-extract:audit', e)
        }

        // Devolve o JSON CRU: quem normaliza é `importarDietaDeJson`, no
        // cliente, com a mesma tolerância e os mesmos tetos do import por texto.
        return NextResponse.json({ ok: true, diet: json, access: acesso.reason })
    } catch (e: unknown) {
        logError('ai:diet-photo-extract', e)
        return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
    }
}
