/**
 * API: POST /api/ai/lab-exam-protocol
 *
 * O coração da feature. Cruza 4 fontes de dados e gera um protocolo integrado
 * (treino + dieta + suplementação com doses) usando o Gemini Pro:
 *   1) Marcadores do exame (lab_exams.extracted_markers — precisa ter rodado o extract)
 *   2) Última avaliação física (assessments)
 *   3) Laudo da avaliação por foto mais recente (body_photo_assessments)
 *   4) Janela de treino dos últimos 90 dias (workouts → aggregateTrainingWindow)
 *
 * O disclaimer médico é FIXO (não vem da IA) e anexado pela UI.
 *
 * Feature VIP (pro+). Rate limit: 5 req/min por usuário (Gemini Pro é caro).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { buildUserContextBlock } from '@/utils/ai/userContext'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { aggregateTrainingWindow, computeSessionStats } from '@/utils/bodyPhoto/trainingWindow'
import { LabProtocolSchema } from '@/schemas/labExam'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Gemini Pro cruzando 4 fontes pode levar >30s

const BodySchema = z.object({ examId: z.string().uuid() }).strip()

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

function extractJson(text: string): unknown {
  let cleaned = String(text || '').trim()
  if (!cleaned) return null
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
  if (fenceMatch?.[1]) cleaned = fenceMatch[1].trim()
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10)

// ─── Camada de Atenuação Fisiológica: sinais computados no backend ──────────────
// Em vez de confiar 100% na aritmética do LLM, pré-calculamos os gatilhos da
// calibração e injetamos o veredito pronto no prompt. Determinístico e auditável.

interface ExtractedMarker {
  name?: string
  value?: number | null
  unit?: string | null
  refMin?: number | null
  refMax?: number | null
  status?: string
}

/** Classifica o usuário como atleta de força ativo a partir da janela de treino. */
function computeAthleteContext(training: { sessions: number; totalVolumeKg: number; totalSets: number }) {
  const { sessions, totalVolumeKg, totalSets } = training
  const isActiveAthlete = sessions >= 20 || totalVolumeKg > 30_000 || totalSets > 400
  // Nível pra calibrar a intensidade da atenuação.
  const level =
    sessions >= 40 || totalVolumeKg > 80_000
      ? 'alto_volume'
      : isActiveAthlete
        ? 'ativo'
        : 'baixo_ou_sem_dados'
  return { isActiveAthlete, level, sessions, totalVolumeKg, totalSets }
}

/** Busca o primeiro marcador cujo nome casa o regex e tem valor numérico. */
function findMarker(markers: ExtractedMarker[], re: RegExp): ExtractedMarker | null {
  for (const m of markers) {
    const name = String(m?.name || '')
    if (re.test(name) && typeof m?.value === 'number' && Number.isFinite(m.value)) return m
  }
  return null
}

/**
 * Deriva os sinais usados pelas regras de calibração (TG/HDL, ferro vs ferritina,
 * função renal). Tudo defensivo — se um marcador não existe, retorna null e a IA
 * cai no comportamento padrão pra aquele eixo.
 */
function deriveLabSignals(rawMarkers: unknown) {
  const markers: ExtractedMarker[] = Array.isArray((rawMarkers as { markers?: unknown })?.markers)
    ? ((rawMarkers as { markers: ExtractedMarker[] }).markers)
    : Array.isArray(rawMarkers)
      ? (rawMarkers as ExtractedMarker[])
      : []
  if (markers.length === 0) return null

  const hdl = findMarker(markers, /hdl/i)
  const tg = findMarker(markers, /triglic|triglyc/i)
  // Ferro sérico: contém "ferro" mas NÃO "ferritina".
  const ferro = markers.find(
    (m) => /ferro|iron/i.test(String(m?.name || '')) && !/ferritina|ferritin/i.test(String(m?.name || '')) && typeof m?.value === 'number',
  ) || null
  const ferritina = findMarker(markers, /ferritina|ferritin/i)
  const creatinina = findMarker(markers, /creatinina|creatinine/i)
  const egfr = findMarker(markers, /tfg|egfr|filtra|ckd.?epi/i)

  const isHigh = (m: ExtractedMarker | null) =>
    m != null && typeof m.value === 'number' && typeof m.refMax === 'number' && m.value > m.refMax
  const isLowOrNormal = (m: ExtractedMarker | null) =>
    m != null && typeof m.value === 'number' && typeof m.refMax === 'number' && m.value <= m.refMax

  const tgHdlRatio =
    hdl?.value && tg?.value && hdl.value > 0 ? Number((tg.value / hdl.value).toFixed(2)) : null

  return {
    tgHdlRatio,
    perfilLipidicoCardioprotetor:
      typeof hdl?.value === 'number' && typeof tg?.value === 'number'
        ? hdl.value > 60 && tg.value < 100
        : null,
    hdl: hdl?.value ?? null,
    triglicerides: tg?.value ?? null,
    // Ferro alto isolado (estoques seguros) → atenuar; ambos altos → sobrecarga real.
    ferroAltoIsolado: ferro && ferritina ? isHigh(ferro) && isLowOrNormal(ferritina) : null,
    sobrecargaFerroReal: ferro && ferritina ? isHigh(ferro) && isHigh(ferritina) : null,
    ferroSerico: ferro?.value ?? null,
    ferritina: ferritina?.value ?? null,
    creatinina: creatinina?.value ?? null,
    egfr: egfr?.value ?? null,
    // Faixa renal G2 (60-89) = zona de atenuação pra atletas.
    egfrEmFaixaAtenuavel: typeof egfr?.value === 'number' ? egfr.value >= 60 && egfr.value <= 89 : null,
  }
}

// ─── Classificador de grupo muscular (keywords PT-BR/EN, determinístico) ────────
const MUSCLE_KEYWORDS: Array<{ group: string; re: RegExp }> = [
  { group: 'Pernas', re: /agacha|leg ?press|cadeira|mesa flex|stiff|terra|afundo|avanço|panturril|gêmeos|gluteo|glúteo|hack|b[uú]lgaro|extensora|flexora|squat|lunge|hip thrust|elevação pélvica/i },
  { group: 'Peito', re: /supino|crucifixo|crossover|peck|peitoral|chest|fly|flexão de braço|push.?up|paralelas/i },
  { group: 'Costas', re: /remada|puxada|pulldown|barra fixa|pull.?up|pullover|levantamento terra|deadlift|row|encolhimento|trap[eé]zio/i },
  { group: 'Ombros', re: /desenvolvimento|elevação lateral|elevação frontal|arnold|militar|shoulder|overhead press|crucifixo inverso|face pull/i },
  { group: 'Bíceps', re: /rosca|biceps|bíceps|curl/i },
  { group: 'Tríceps', re: /tr[ií]ceps|testa|coice|pulley|extensão de cotovelo|mergulho|dips/i },
  { group: 'Abdômen/Core', re: /abdomin|prancha|plank|crunch|core|obl[ií]quo|elevação de perna|infra/i },
]

function classifyMuscleGroup(name: string): string {
  for (const { group, re } of MUSCLE_KEYWORDS) if (re.test(name)) return group
  return 'Outros'
}

interface DatedSession { notes?: unknown; date: string | null }

/**
 * Sinais temporais do treino relativos à data do exame:
 *  - proximidade (dias entre o último treino e a coleta) → explica CK/creatinina/TGO altas
 *  - tendência (última semana vs média) → detecta pico de carga ou deload
 *  - volume por grupo muscular → contextualiza marcadores por padrão de treino
 */
function computeTrainingTemporalSignals(sessions: DatedSession[], examDateStr: string | null, anchorMs: number) {
  const anchor = examDateStr ? new Date(`${String(examDateStr).slice(0, 10)}T12:00:00Z`).getTime() : anchorMs
  const validAnchor = Number.isFinite(anchor) ? anchor : anchorMs
  const DAY = 86400_000
  const weekStart = validAnchor - 7 * DAY

  let lastSessionMs: number | null = null
  let lastWeekVolumeKg = 0
  let totalVolumeKg = 0
  let earliestMs: number | null = null
  const byGroup = new Map<string, number>()

  for (const s of sessions) {
    if (!s.date) continue
    const ms = new Date(`${String(s.date).slice(0, 10)}T12:00:00Z`).getTime()
    if (!Number.isFinite(ms) || ms > validAnchor) continue // ignora treino DEPOIS da coleta
    const stats = computeSessionStats(s.notes)
    if (stats.totalSets === 0) continue
    totalVolumeKg += stats.volumeKg
    if (lastSessionMs === null || ms > lastSessionMs) lastSessionMs = ms
    if (earliestMs === null || ms < earliestMs) earliestMs = ms
    if (ms >= weekStart) lastWeekVolumeKg += stats.volumeKg
    for (const [name, ev] of stats.byExercise) {
      const g = classifyMuscleGroup(name)
      byGroup.set(g, (byGroup.get(g) || 0) + ev.volumeKg)
    }
  }

  const spanWeeks = earliestMs !== null ? Math.max(1, (validAnchor - earliestMs) / (7 * DAY)) : 1
  const avgWeeklyVolumeKg = totalVolumeKg / spanWeeks
  const daysSinceLastSession = lastSessionMs !== null ? Math.round((validAnchor - lastSessionMs) / DAY) : null

  let volumeTrend: 'pico' | 'estavel' | 'deload' | 'sem_dados' = 'sem_dados'
  if (lastSessionMs !== null && avgWeeklyVolumeKg > 0) {
    const ratio = lastWeekVolumeKg / avgWeeklyVolumeKg
    volumeTrend = ratio >= 1.3 ? 'pico' : ratio <= 0.6 ? 'deload' : 'estavel'
  }

  const volumeByMuscleGroup = Object.fromEntries(
    [...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, v]) => [g, Math.round(v)]),
  )

  return {
    examDateUsada: examDateStr ? String(examDateStr).slice(0, 10) : 'hoje (data do exame ausente)',
    diasDesdeUltimoTreino: daysSinceLastSession,
    // Janela crítica de 72h pós-treino: CK/creatinina/TGO podem estar elevadas.
    treinoRecenteAfetaExame: daysSinceLastSession !== null && daysSinceLastSession <= 3,
    volumeUltimaSemanaKg: Math.round(lastWeekVolumeKg),
    volumeMedioSemanalKg: Math.round(avgWeeklyVolumeKg),
    tendenciaVolume: volumeTrend, // pico = sobrecarga recente, deload = recuperação
    volumePorGrupoMuscular: volumeByMuscleGroup,
  }
}

const PROMPT_HEADER = [
  // ── IDENTIDADE ────────────────────────────────────────────────────────────────
  'IDENTIDADE: Você é uma equipe de elite em medicina esportiva composta por:',
  '  • Médico do esporte especialista em fisiologia do exercício',
  '  • Nefrologista esportivo (interpretação renal para atletas)',
  '  • Cardiologista esportivo (lipidograma e risco cardiovascular em alta performance)',
  '  • Nutricionista esportivo de alto rendimento',
  '  • Preparador físico sênior com acesso ao histórico real de treino',
  '',
  'Você analisa EXAMES LABORATORIAIS de praticantes de musculação e esportes de força,',
  'cruzando com avaliação física e histórico real de treino dos últimos 90 dias.',
  'Seu objetivo é gerar um protocolo prático de OTIMIZAÇÃO DE PERFORMANCE E CONTROLE DE DANOS,',
  'não um laudo clínico conservador para população sedentária.',
  '',
  // ── STEP 0: AVALIAR CONTEXTO ATLÉTICO ─────────────────────────────────────────
  'PASSO OBRIGATÓRIO ANTES DE QUALQUER INTERPRETAÇÃO — USE O CONTEXTO ATLÉTICO JÁ COMPUTADO:',
  'O backend JÁ classificou o usuário. NÃO recalcule — confie nos campos prontos dos DADOS:',
  '  • "contextoAtletico.isActiveAthlete" (boolean): se TRUE, o usuário É atleta de força ativo.',
  '  • "contextoAtletico.level": "alto_volume" | "ativo" | "baixo_ou_sem_dados".',
  '  • "sinaisDerivados": razão TG/HDL, flags de ferro vs ferritina e faixa renal — JÁ calculados.',
  '    Use esses valores prontos; só recalcule se um campo vier null.',
  '',
  'SE contextoAtletico.isActiveAthlete = TRUE: as faixas de referência populacionais (baseadas em',
  'sedentários) geram falsos alarmes. Aplique RIGOROSAMENTE as Regras de Calibração abaixo ANTES',
  'de emitir qualquer alerta. Quanto maior o "level", mais forte a atenuação.',
  'SE isActiveAthlete = FALSE: interprete de forma clínica padrão (sem atenuação atlética),',
  'mas ainda evitando alarmismo desnecessário.',
  '',
  // ── CAMADA DE ATENUAÇÃO FISIOLÓGICA ──────────────────────────────────────────
  '════════════════════════════════════════════════════════════════════',
  'REGRAS DE CALIBRAÇÃO FISIOLÓGICA PARA ATLETAS (ATTENUATION LAYER)',
  '════════════════════════════════════════════════════════════════════',
  '',
  '── REGRA 1 • FUNÇÃO RENAL (Creatinina / TFG / eGFR) ────────────────────────',
  'SE o usuário for ATLETA ATIVO (critérios acima):',
  '',
  '▸ PROIBIDO usar os termos "Doença Renal Crônica", "DRC Estágio 2", "insuficiência renal"',
  '  ou similares quando a TFG/eGFR estiver entre 60 e 89 mL/min/1,73m².',
  '',
  '▸ Creatinina ligeiramente elevada (até ~1,5 mg/dL em homens / ~1,2 mg/dL em mulheres)',
  '  em atletas de força É FISIOLOGICAMENTE ESPERADA. Representa maior pool de massa muscular',
  '  e turnover de creatina pelo treino — NÃO nefropatia.',
  '',
  '▸ A fórmula CKD-EPI usa a média da população sedentária como referência e SUBESTIMA',
  '  sistematicamente a função renal real de atletas com alta massa muscular.',
  '',
  '▸ CLASSIFICAÇÃO OBRIGATÓRIA: status = "normal" ou, no máximo, "watch".',
  '  NUNCA classifique como "high" ou "critical_high" se o contexto atlético explicar o valor.',
  '',
  '▸ TEXTO OBRIGATÓRIO na "reason" do marcador renal:',
  '  "A TFG calculada pela fórmula CKD-EPI tende a subestimar a função renal em praticantes',
  '   de musculação com alta massa muscular. A creatinina elevada reflete o pool muscular',
  '   aumentado e o turnover de creatina pelo treino de força — não nefropatia.',
  '   Para rastreio renal isolado, livre de interferência muscular, solicite Cistatina-C',
  '   na próxima consulta com o médico."',
  '',
  '▸ Em medicalAlerts renais para atletas: use severity = "watch" NO MÁXIMO.',
  '  NUNCA "urgent" para creatinina/TFG em faixa G2 (60-89) em atleta ativo.',
  '  O action deve ser: acompanhamento de rotina + solicitar Cistatina-C.',
  '',
  '── REGRA 2 • PERFIL LIPÍDICO (Colesterol Total / LDL) ───────────────────────',
  '▸ PROIBIDO interpretar Colesterol Total ou LDL de forma ISOLADA.',
  '',
  '▸ Use "sinaisDerivados.tgHdlRatio" (já calculado: Triglicerídeos ÷ HDL). Se null, calcule você.',
  '  - TG/HDL < 2,0 = perfil metabólico favorável (baixo risco de partículas LDL pequenas/densas)',
  '  - TG/HDL > 3,0 = resistência insulínica, risco cardiovascular real',
  '',
  '▸ SE "sinaisDerivados.perfilLipidicoCardioprotetor" = true (HDL > 60 E TG < 100) → CARDIOPROTETOR.',
  '  Nesse cenário, MESMO QUE LDL esteja elevado (ex: 140-180 mg/dL):',
  '  - REBAIXE o alerta para severity = "watch" no máximo.',
  '  - NÃO gere pânico cardiovascular.',
  '  - TEXTO OBRIGATÓRIO: "O HDL elevado exerce efeito cardioprotetor robusto mediando o',
  '    transporte reverso do colesterol e reduzindo o potencial inflamatório do LDL circulante.',
  '    A razão TG/HDL de [calcule e cite o valor] está em faixa ótima (<2,0), sendo superior',
  '    ao LDL absoluto como marcador de risco cardiovascular em atletas.',
  '    Abordagem de primeira linha: Psyllium 5-10g/dia (antes das refeições) e Ômega-3',
  '    2-4g EPA+DHA/dia. Reavalie o lipidograma em 90-120 dias com esse protocolo."',
  '',
  '▸ Use alerta "urgent" apenas se: HDL < 35 mg/dL E TG > 200 mg/dL (síndrome metabólica real).',
  '',
  '── REGRA 3 • FERRO SÉRICO vs. ESTOQUES (Ferritina) ─────────────────────────',
  '▸ PROIBIDO sugerir "Hemocromatose" ou "Sobrecarga Crônica de Ferro"',
  '  com base APENAS no Ferro Sérico elevado.',
  '',
  '▸ Use os flags prontos:',
  '  → "sinaisDerivados.sobrecargaFerroReal" = true (ferro E ferritina altos): "moderate"/"urgent".',
  '  → "sinaisDerivados.ferroAltoIsolado" = true (ferro alto, ferritina normal/baixa): "watch" apenas.',
  '',
  '▸ SE ferroAltoIsolado = true (apenas Ferro Sérico elevado, estoques de Ferritina seguros):',
  '  - TEXTO OBRIGATÓRIO: "O ferro sérico elevado isoladamente reflete com frequência a ingestão',
  '    alimentar recente (carnes vermelhas, vísceras) ou uso de suplementos contendo ferro nas',
  '    24-48h anteriores à coleta — não representa sobrecarga crônica.',
  '    Seus estoques reais (Ferritina) estão controlados, o que descarta Hemocromatose ativa.',
  '    Para resultado mais representativo, evite suplementos de ferro e refeições ricas em carne',
  '    na véspera da próxima coleta."',
  '',
  '── REGRA 4 • TOM E HIERARQUIA DE ALERTAS ────────────────────────────────────',
  '▸ TOM: "Otimização de Performance e Controle de Danos" — não alarmismo clínico.',
  '▸ Para atletas com marcadores levemente fora da referência populacional:',
  '  PARTA da hipótese de ADAPTAÇÃO FISIOLÓGICA antes de patologia.',
  '',
  '▸ Use severity = "urgent" SOMENTE para:',
  '  - Glicemia > 200 mg/dL ou HbA1c > 8%',
  '  - TGO/TGP > 3x o limite superior de referência (hepatite significativa)',
  '  - TSH < 0,1 ou > 10 mIU/L',
  '  - PCR > 10 mg/L (inflamação sistêmica grave)',
  '  - Creatinina > 2,0 mg/dL (MESMO em atletas — acima disso há preocupação real)',
  '  - Sódio < 125 ou > 155 mEq/L, Potássio < 2,5 ou > 6,5 mEq/L',
  '  - Hemoglobina < 8 g/dL',
  '',
  '▸ Para tudo relacionado a função renal/lipídio/ferro em atletas, aplique as Regras 1-3.',
  '',
  '── REGRA 5 • TIMING DA COLETA (proximidade treino ↔ exame) ──────────────────',
  'Use o campo "treinoTemporal" dos DADOS (já computado em relação à DATA DO EXAME):',
  '',
  '▸ SE "treinoTemporal.treinoRecenteAfetaExame" = true (último treino ≤ 3 dias antes da coleta):',
  '  Marcadores de DANO MUSCULAR e turnover ficam transitoriamente elevados por 24-72h:',
  '  CK (creatinoquinase), Creatinina, TGO/AST, LDH, Ácido Úrico, e até leucócitos.',
  '  → Para ESSES marcadores, atenue fortemente e explique no texto, citando os dias:',
  '    "Você treinou há [diasDesdeUltimoTreino] dia(s) antes da coleta. Marcadores de dano',
  '     muscular (CK, AST, creatinina) sobem 24-72h após treino intenso e retornam ao basal',
  '     com descanso. Para um retrato sem esse ruído, colha o sangue após 48-72h sem treino',
  '     de força pesado."',
  '',
  '▸ SE "treinoTemporal.tendenciaVolume" = "pico": houve sobrecarga de volume na semana da coleta.',
  '  Reforça a explicação acima e justifica marcadores inflamatórios (PCR) levemente altos.',
  '▸ SE "tendenciaVolume" = "deload": recuperação — marcadores de dano tendem ao basal real.',
  '',
  '▸ Use "treinoTemporal.volumePorGrupoMuscular" pra conectar marcadores ao padrão de treino',
  '  (ex.: alto volume de Pernas + creatinina alta = coerente com dano de grandes grupos).',
  '',
  '════════════════════════════════════════════════════════════════════',
  'REGRAS GERAIS (sempre aplicar)',
  '════════════════════════════════════════════════════════════════════',
  '',
  '▸ Seja concreto: cite o valor exato do marcador, o valor de referência e o desvio.',
  '  Ex: "Creatinina 1,32 mg/dL (ref. 0,7–1,2) — 10% acima do limite, contexto atlético."',
  '▸ Suplementação: OTC, doses seguras de bula, marque otcAvailable corretamente.',
  '  NUNCA: anabolizantes, hormônios, controlados → se sugerido pelo exame, vire medicalAlert.',
  '▸ Integre treino real: cite sessões, volume, exercícios top ao justificar recomendações.',
  '▸ Se faltar dado (sem treino ou avaliação): reduza confidence para "low" ou "medium" e mencione.',
  '▸ followUp.retestIn: sugira prazo de otimização (60-120 dias), não urgência.',
  '▸ Responda SEMPRE em português do Brasil.',
  '▸ NÃO inclua disclaimer no JSON — ele é adicionado pelo app.',
  '',
  'Responda APENAS com JSON puro (sem markdown, sem texto antes/depois):',
  '{',
  '  "headline": "frase de impacto conectando exame e objetivo de performance",',
  '  "overallAssessment": "avaliação geral 2-4 frases, contextualizando o nível atlético",',
  '  "medicalAlerts": [{ "marker": "...", "value": "...", "severity": "urgent|moderate|watch", "action": "..." }],',
  '  "trainingProtocol": { "summary": "...", "adjustments": [{ "area": "...", "recommendation": "...", "reason": "...", "priority": "high|medium|low" }] },',
  '  "nutritionProtocol": { "summary": "...", "adjustments": [{ "nutrient": "...", "recommendation": "...", "reason": "...", "priority": "high|medium|low" }], "foodSuggestions": ["..."] },',
  '  "supplementation": [{ "name": "...", "dose": "...", "timing": "...", "reason": "...", "duration": "...", "priority": "high|medium|low", "otcAvailable": true }],',
  '  "followUp": { "retestIn": "...", "markersToWatch": ["..."], "notes": "..." },',
  '  "confidence": "high|medium|low"',
  '}',
].join('\n')

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:lab-protocol:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(auth.supabase, userId, 'lab_exams', { meter: true })
    if (!access.allowed) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { examId } = parsed.data!

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const admin = createAdminClient()

    const { data: exam } = await admin
      .from('lab_exams')
      .select('id, user_id, trainer_id, extracted_markers, exam_date')
      .eq('id', examId)
      .maybeSingle()
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    const trainerId = (exam as { trainer_id?: string | null }).trainer_id || null
    if (userId !== assessedUserId && userId !== trainerId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const markers = (exam as { extracted_markers?: unknown }).extracted_markers
    if (!markers) {
      return NextResponse.json({ ok: false, error: 'no_markers', message: 'Extraia os marcadores do exame primeiro.' }, { status: 400 })
    }

    // ── Fonte 2: última avaliação física ────────────────────────────────────
    const { data: lastAssessment } = await admin
      .from('assessments')
      .select('assessment_date, weight, height, age, gender, body_fat_percentage, lean_mass, bmr, bia_body_fat_percentage, bia_lean_mass, bia_visceral_fat, bia_metabolic_age')
      .eq('user_id', assessedUserId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Fonte 3: laudo da avaliação por foto mais recente ───────────────────
    const { data: lastPhoto } = await admin
      .from('body_photo_assessments')
      .select('analysis, composition_score, symmetry_score, posture_score, proportion_score, body_fat_estimate_low, body_fat_estimate_high')
      .eq('user_id', assessedUserId)
      .eq('status', 'done')
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Fonte 4: janela de treino — ancorada na DATA DO EXAME ────────────────
    // O treino que influencia os marcadores é o que ANTECEDE a coleta, não o de hoje.
    const examDateStr = (exam as { exam_date?: string | null }).exam_date || null
    const anchorMs = examDateStr
      ? new Date(`${String(examDateStr).slice(0, 10)}T12:00:00Z`).getTime()
      : Date.now()
    const toDate = new Date(Number.isFinite(anchorMs) ? anchorMs : Date.now())
    const fromDate = new Date(toDate.getTime() - 90 * 86400_000)

    // Guarda notes + data efetiva (completed_at || date) por workout.
    const merged = new Map<string, { notes?: unknown; date: string | null }>()
    const collect = (rows: unknown, dateField: 'completed_at' | 'date') => {
      if (!Array.isArray(rows)) return
      for (const r of rows) {
        const row = r as { id?: string; notes?: unknown; completed_at?: string | null; date?: string | null }
        if (!row?.id) continue
        const d = String(row[dateField] || '').slice(0, 10) || null
        const existing = merged.get(String(row.id))
        merged.set(String(row.id), { notes: row.notes, date: existing?.date || d })
      }
    }
    const { data: byCompleted } = await admin
      .from('workouts').select('id, notes, completed_at')
      .eq('user_id', assessedUserId).eq('is_template', false)
      .gte('completed_at', fromDate.toISOString()).lte('completed_at', toDate.toISOString())
    collect(byCompleted, 'completed_at')
    const { data: byDate } = await admin
      .from('workouts').select('id, notes, date')
      .eq('user_id', assessedUserId).eq('is_template', false)
      .gte('date', dayStr(fromDate)).lte('date', dayStr(toDate))
    collect(byDate, 'date')

    const sessionList = [...merged.values()]
    const training = aggregateTrainingWindow(sessionList)

    // Sinais computados no backend pra ancorar a Camada de Atenuação Fisiológica.
    const athleteContext = computeAthleteContext(training)
    const derivedSignals = deriveLabSignals(markers)
    const temporalSignals = computeTrainingTemporalSignals(sessionList, examDateStr, anchorMs)

    const promptData = {
      // Veredito pronto: a IA NÃO precisa decidir se é atleta — recebe computado.
      contextoAtletico: athleteContext,
      // Sinais derivados (TG/HDL, ferro vs ferritina, faixa renal) já calculados.
      sinaisDerivados: derivedSignals,
      // Sinais temporais: proximidade treino↔coleta, tendência de carga, volume por grupo.
      treinoTemporal: temporalSignals,
      exame: markers,
      avaliacaoFisica: lastAssessment || null,
      laudoFoto: lastPhoto
        ? {
            analysis: (lastPhoto as { analysis?: unknown }).analysis,
            scores: {
              composition: (lastPhoto as { composition_score?: number }).composition_score,
              symmetry: (lastPhoto as { symmetry_score?: number }).symmetry_score,
              posture: (lastPhoto as { posture_score?: number }).posture_score,
              proportion: (lastPhoto as { proportion_score?: number }).proportion_score,
            },
          }
        : null,
      treino90dias: {
        sessoes: training.sessions,
        volumeTotalKg: training.totalVolumeKg,
        seriesTotais: training.totalSets,
        topExercicios: training.topExercises,
      },
    }

    // Complementa a lógica própria (treino/avaliação/exames) com os setores que
    // faltavam no protocolo: nutrição real e objetivo/restrições do usuário.
    const userCtx = await buildUserContextBlock(admin, assessedUserId, ['nutrition', 'profile'])
    const prompt = `${PROMPT_HEADER}\n\n${userCtx ? userCtx + '\n\n' : ''}DADOS:\n${JSON.stringify(promptData)}`

    const model = getGeminiModel(apiKey, env.gemini.modelId)
    const geminiResult = await safeGemini('lab-exam-protocol', () => model.generateContent(prompt))
    if ('errorResponse' in geminiResult) {
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'ai_error' }).eq('id', examId)
      return geminiResult.errorResponse
    }

    const rawText = geminiResult.value?.response?.text?.() || ''
    const validated = LabProtocolSchema.safeParse(extractJson(rawText))
    if (!validated.success) {
      logError('ai:lab-exam-protocol:invalid', new Error('schema mismatch'), { rawPreview: String(rawText).slice(0, 300) })
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'protocol_failed' }).eq('id', examId)
      return NextResponse.json({ ok: false, error: 'protocol_failed', message: 'Não consegui gerar o protocolo. Tente novamente.' }, { status: 422 })
    }

    await admin
      .from('lab_exams')
      .update({
        protocol: validated.data,
        status: 'done',
        ai_model: env.gemini.modelId,
        ai_analyzed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', examId)

    return NextResponse.json({ ok: true, data: validated.data })
  } catch (e) {
    logError('ai:lab-exam-protocol', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
