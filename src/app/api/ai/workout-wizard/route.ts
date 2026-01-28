import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { generateWorkoutFromWizard } from '@/utils/workoutWizardGenerator'

import validation from '@/utils/workoutWizardAiValidation'

export const dynamic = 'force-dynamic'

const WORKOUT_WIZARD_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => {
  try {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

const extractJsonFromModelText = (text: string) => {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const toBool = (v: any) => Boolean(v)

const normalizeAnswers = (answersRaw: any) => {
  const a = answersRaw && typeof answersRaw === 'object' ? answersRaw : {}
  const goal = String(a.goal || 'hypertrophy')
  const split = String(a.split || 'full_body')
  const focus = String(a.focus || 'balanced')
  const equipment = String(a.equipment || 'gym')
  const level = String(a.level || 'beginner')
  const daysPerWeek = Number(a.daysPerWeek || 3) || 3
  const timeMinutes = Number(a.timeMinutes || 45) || 45
  const constraints = String(a.constraints || '')
  return { goal, split, focus, equipment, level, daysPerWeek, timeMinutes, constraints }
}

const buildPromptSingle = (answers: any) => {
  const constraints = String(answers?.constraints || '')
  const constraintsNormalized = String((validation as any)?.normalizeText?.(constraints) ?? '').trim()
  const machinePriorityFromText = toBool((validation as any)?.detectFlagsFromConstraints?.(constraints)?.machinePriority)
  const shoulderFromText = toBool((validation as any)?.detectFlagsFromConstraints?.(constraints)?.shoulderSensitive)
  const avoidOverheadFromText = toBool((validation as any)?.detectFlagsFromConstraints?.(constraints)?.avoidOverhead)
  const noBarbellFromText = toBool((validation as any)?.detectFlagsFromConstraints?.(constraints)?.noBarbell)

  const absoluteRules: string[] = [
    'Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    'Escreva em pt-BR.',
    'A prioridade máxima é obedecer fielmente as restrições/observações do usuário (answers.constraints). Não ignore.',
    'Se houver conflito entre objetivo/split e restrições, adapte o treino para cumprir as restrições.',
    'Use nomes comuns de exercícios de academia (Brasil).',
    'Não invente equipamentos fora do contexto do usuário.',
    'O campo rpe deve ser number ou null (ex.: 8). Não use faixas tipo "7-9".',
    'Evite repetir exatamente o mesmo treino para níveis diferentes.',
  ]

  const safetyRules: string[] = []
  if (shoulderFromText || avoidOverheadFromText) {
    safetyRules.push('Usuário relatou dor/restrição no ombro/overhead: evitar desenvolvimento/militar/overhead press, dips/paralelas e remada alta/upright row.')
    safetyRules.push('Prefira: máquinas/cabos, pegada neutra, movimentos estáveis e controlados.')
  }
  if (noBarbellFromText) {
    safetyRules.push('Usuário pediu sem barra: evitar exercícios com barra livre (barbell) como padrão; preferir máquinas, halteres ou cabos.')
  }
  if (machinePriorityFromText) {
    safetyRules.push('Usuário pediu priorizar máquinas (ex.: Smart Fit): a maior parte dos exercícios deve ser em máquinas/cabos.')
  }

  const schema = [
    '{',
    '  "title": string,',
    '  "notes": string (curto, opcional),',
    '  "constraintsApplied": string[] (2-6 bullets explicando como você cumpriu as restrições),',
    '  "rejectedItems": string[] (0-6, opcional, itens que você evitou por restrição),',
    '  "exercises": [',
    '    { "name": string, "sets": number, "reps": string, "restTime": number, "rpe": number|null, "notes": string|null }',
    '  ]',
    '}',
  ].join('\n')

  const levelGuidance =
    answers.level === 'beginner'
      ? 'Nível iniciante: exercícios simples, estáveis, técnica fácil, volume moderado.'
      : answers.level === 'advanced'
        ? 'Nível avançado: mais volume/variação e progressão, sem sacrificar segurança.'
        : 'Nível intermediário: equilíbrio entre volume e complexidade.'

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    '',
    'REGRAS ABSOLUTAS:',
    ...absoluteRules.map((r) => `- ${r}`),
    '',
    safetyRules.length ? 'REGRAS DE SEGURANÇA:' : '',
    ...safetyRules.map((r) => `- ${r}`),
    '',
    'OBJETIVO:',
    '- Gerar um treino que combine com o nível, objetivo, tempo e equipamento.',
    '',
    'GUIA DE NÍVEL:',
    `- ${levelGuidance}`,
    '',
    'DADOS DO USUÁRIO (JSON):',
    JSON.stringify(answers),
    '',
    'CAMPO DE RESTRIÇÕES (texto original):',
    constraints,
    '',
    'CAMPO DE RESTRIÇÕES (normalizado):',
    constraintsNormalized,
    '',
    'FORMATO DE SAÍDA (JSON):',
    schema,
  ]
    .filter(Boolean)
    .join('\n')

  return prompt
}

const buildPromptVariants = (answers: any, variants: string[]) => {
  const schema = [
    '{',
    '  "drafts": [',
    '    {',
    '      "level": "beginner"|"intermediate"|"advanced",',
    '      "title": string,',
    '      "notes": string (curto, opcional),',
    '      "constraintsApplied": string[],',
    '      "rejectedItems": string[],',
    '      "exercises": [ { "name": string, "sets": number, "reps": string, "restTime": number, "rpe": number|null, "notes": string|null } ]',
    '    }',
    '  ]',
    '}',
  ].join('\n')

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    'Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    'Escreva em pt-BR.',
    'A prioridade máxima é obedecer fielmente as restrições/observações do usuário (answers.constraints). Não ignore.',
    'Gere múltiplas variações do treino, uma para cada nível solicitado, e garanta que não sejam iguais.',
    '',
    'Níveis solicitados:',
    JSON.stringify(variants),
    '',
    'Dados do usuário (JSON):',
    JSON.stringify(answers),
    '',
    'Formato de saída (JSON):',
    schema,
  ].join('\n')

  return prompt
}

const buildPromptProgram = (answers: any, days: number) => {
  const schema = [
    '{',
    '  "drafts": [',
    '    {',
    '      "title": string,',
    '      "notes": string (curto, opcional),',
    '      "constraintsApplied": string[],',
    '      "rejectedItems": string[],',
    '      "exercises": [ { "name": string, "sets": number, "reps": string, "restTime": number, "rpe": number|null, "notes": string|null } ]',
    '    }',
    '  ]',
    '}',
  ].join('\n')

  const splitHint =
    answers.split === 'ppl'
      ? 'Use PPL: organize os dias em Push / Pull / Pernas, repetindo conforme necessário.'
      : answers.split === 'upper_lower'
        ? 'Use Upper/Lower: alterne Upper e Lower, repetindo conforme necessário.'
        : 'Use Full Body: crie variações A/B para não repetir exatamente os mesmos exercícios.'

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    'Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    'Escreva em pt-BR.',
    'A prioridade máxima é obedecer fielmente as restrições/observações do usuário (answers.constraints). Não ignore.',
    'O campo rpe deve ser number ou null (ex.: 8). Não use faixas tipo "7-9".',
    '',
    `Gere um PLANO SEMANAL com ${days} treinos (um por dia).`,
    'No campo "title": NÃO inclua letra (ex.: "A -") e NÃO inclua "(Dia X)" ou dia da semana. Use apenas o nome do treino (ex.: "Empurrar", "Pernas", "Puxar + Abs").',
    splitHint,
    'Garanta que os treinos sejam diferentes entre si (não repetir a mesma lista).',
    '',
    'Dados do usuário (JSON):',
    JSON.stringify(answers),
    '',
    'Formato de saída (JSON):',
    schema,
  ].join('\n')

  return prompt
}

const genText = async (prompt: string) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return { ok: false as const, error: 'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY.' }
  }
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: WORKOUT_WIZARD_MODEL })
  const result = await model.generateContent([{ text: prompt }] as any)
  const text = (await result?.response?.text()) || ''
  return { ok: true as const, text }
}

const applyFallbackFilter = (draft: any, constraintsText: string) => {
  const flags = (validation as any)?.detectFlagsFromConstraints?.(constraintsText) || {}
  const normalized = (validation as any)?.normalizeDraft?.(draft) || { title: 'Treino', exercises: [] }
  const forbidShoulder = Boolean(flags.shoulderSensitive || flags.avoidOverhead)
  const forbidBarbell = Boolean(flags.noBarbell)
  const machinePriority = Boolean(flags.machinePriority)

  const replaceMap: Array<{ test: (n: string) => boolean; replace: string }> = []
  if (forbidShoulder) {
    replaceMap.push(
      { test: (n) => (validation as any).normalizeText(n).includes('desenvolvimento'), replace: 'Face pull' },
      { test: (n) => (validation as any).normalizeText(n).includes('militar'), replace: 'Face pull' },
      { test: (n) => (validation as any).normalizeText(n).includes('overhead'), replace: 'Face pull' },
      { test: (n) => (validation as any).normalizeText(n).includes('paralelas'), replace: 'Tríceps na polia (corda)' },
      { test: (n) => (validation as any).normalizeText(n).includes('dips'), replace: 'Tríceps na polia (corda)' },
      { test: (n) => (validation as any).normalizeText(n).includes('remada alta'), replace: 'Face pull' },
    )
  }
  if (forbidBarbell || machinePriority) {
    replaceMap.push(
      { test: (n) => (validation as any).normalizeText(n).includes('supino reto'), replace: 'Chest press (máquina)' },
      { test: (n) => (validation as any).normalizeText(n).includes('supino inclinado'), replace: 'Chest press inclinado (máquina)' },
      { test: (n) => (validation as any).normalizeText(n).includes('agachamento livre'), replace: 'Leg press' },
      { test: (n) => (validation as any).normalizeText(n).includes('remada curvada'), replace: 'Remada baixa (máquina/cabo)' },
      { test: (n) => (validation as any).normalizeText(n).includes('levantamento terra'), replace: 'Hip thrust (máquina)' },
      { test: (n) => (validation as any).normalizeText(n).includes('terra romeno'), replace: 'Mesa flexora' },
    )
  }

  const next = {
    title: normalized.title,
    exercises: normalized.exercises.map((e: any) => {
      const name = String(e?.name || '').trim()
      const mapped = replaceMap.find((m) => m.test(name))
      return { ...e, name: mapped ? mapped.replace : name }
    }),
  }
  return next
}

const normalizeVariantLevel = (v: string) => {
  const t = String(v || '').trim().toLowerCase()
  if (t === 'beginner' || t === 'intermediate' || t === 'advanced') return t
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => ({}))
    const answers = normalizeAnswers(body?.answers)
    const variantsRaw = Array.isArray(body?.variants) ? body.variants : null
    const variants = variantsRaw ? (variantsRaw.map((v: any) => normalizeVariantLevel(String(v))).filter(Boolean) as string[]) : null
    const mode = String(body?.mode || 'single').trim().toLowerCase()
    const isProgram = mode === 'program' || mode === 'weekly' || mode === 'plan'
    const daysRequested = Math.max(2, Math.min(6, Number(answers?.daysPerWeek || 3) || 3))

    const runSingle = async (answersForRun: any) => {
      const prompt = buildPromptSingle(answersForRun)
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await genText(attempt === 0 ? prompt : `${prompt}\n\nCORREÇÃO OBRIGATÓRIA:\n${lastError}\nRefaça o JSON obedecendo todas as regras.`)
        if (!res.ok) return { ok: false as const, error: res.error }
        const parsed = extractJsonFromModelText(res.text)
        if (!parsed) {
          lastError = 'Resposta inválida (JSON não parseável).'
          continue
        }
        const check = (validation as any).validateDraftAgainstConstraints(parsed, answersForRun.constraints)
        if (!check?.ok) {
          lastError = `Problemas encontrados: ${Array.isArray(check?.errors) ? check.errors.join(' ') : 'violação de regras'}`
          continue
        }
        return { ok: true as const, draft: (validation as any).normalizeDraft(parsed) }
      }
      return { ok: false as const, error: lastError || 'Resposta inválida da IA.' }
    }

    const runVariants = async (answersForRun: any, levels: string[]) => {
      const prompt = buildPromptVariants(answersForRun, levels)
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await genText(attempt === 0 ? prompt : `${prompt}\n\nCORREÇÃO OBRIGATÓRIA:\n${lastError}\nRefaça o JSON obedecendo todas as regras.`)
        if (!res.ok) return { ok: false as const, error: res.error }
        const parsed = extractJsonFromModelText(res.text)
        const draftsRaw = parsed && typeof parsed === 'object' ? (Array.isArray((parsed as any).drafts) ? (parsed as any).drafts : null) : null
        if (!draftsRaw || !draftsRaw.length) {
          lastError = 'Resposta inválida (drafts ausente).'
          continue
        }
        const normalizedDrafts = draftsRaw
          .map((d: any) => {
            const level = normalizeVariantLevel(String(d?.level || ''))
            if (!level) return null
            const check = (validation as any).validateDraftAgainstConstraints(d, answersForRun.constraints)
            if (!check?.ok) return { level, ok: false, errors: check?.errors || [] }
            return { level, ok: true, draft: (validation as any).normalizeDraft(d) }
          })
          .filter(Boolean)
        const hasInvalid = normalizedDrafts.some((d: any) => !d.ok)
        if (hasInvalid) {
          lastError = normalizedDrafts
            .filter((d: any) => !d.ok)
            .slice(0, 2)
            .map((d: any) => `[${d.level}] ${Array.isArray(d.errors) ? d.errors.join(' ') : 'inválido'}`)
            .join(' ')
          continue
        }
        const sorted = levels
          .map((lv) => normalizedDrafts.find((d: any) => d.level === lv))
          .filter(Boolean)
          .map((d: any) => d.draft)
        if (sorted.length >= 2) {
          const sim = (validation as any).similarityByNames(sorted[0], sorted[1])
          if (sim >= 0.7) {
            lastError = `Os treinos ficaram parecidos demais (similaridade ${(sim * 100).toFixed(0)}%). Garanta diferença real de exercícios e estrutura entre níveis.`
            continue
          }
        }
        return { ok: true as const, drafts: sorted }
      }
      return { ok: false as const, error: lastError || 'Resposta inválida da IA.' }
    }

    const runProgram = async (answersForRun: any, days: number) => {
      const prompt = buildPromptProgram(answersForRun, days)
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await genText(attempt === 0 ? prompt : `${prompt}\n\nCORREÇÃO OBRIGATÓRIA:\n${lastError}\nRefaça o JSON obedecendo todas as regras.`)
        if (!res.ok) return { ok: false as const, error: res.error }
        const parsed = extractJsonFromModelText(res.text)
        const draftsRaw = parsed && typeof parsed === 'object' ? (Array.isArray((parsed as any).drafts) ? (parsed as any).drafts : null) : null
        if (!draftsRaw || draftsRaw.length < days) {
          lastError = 'Resposta inválida (drafts ausente ou com poucos dias).'
          continue
        }
        const normalizedDrafts = draftsRaw
          .slice(0, days)
          .map((d: any) => {
            const check = (validation as any).validateDraftAgainstConstraints(d, answersForRun.constraints)
            if (!check?.ok) return { ok: false, errors: check?.errors || [] }
            return { ok: true, draft: (validation as any).normalizeDraft(d) }
          })

        const hasInvalid = normalizedDrafts.some((d: any) => !d.ok)
        if (hasInvalid) {
          lastError = normalizedDrafts
            .filter((d: any) => !d.ok)
            .slice(0, 2)
            .map((d: any) => (Array.isArray(d.errors) ? d.errors.join(' ') : 'inválido'))
            .join(' ')
          continue
        }

        const drafts = normalizedDrafts.map((d: any) => d.draft)
        let tooSimilar = false
        for (let i = 0; i < drafts.length; i++) {
          for (let j = i + 1; j < drafts.length; j++) {
            const sim = (validation as any).similarityByNames(drafts[i], drafts[j])
            if (sim >= 0.75) {
              tooSimilar = true
              lastError = `Os treinos ficaram parecidos demais (similaridade ${(sim * 100).toFixed(0)}% entre dia ${i + 1} e dia ${j + 1}). Garanta diferença real entre os dias.`
              break
            }
          }
          if (tooSimilar) break
        }
        if (tooSimilar) continue

        return { ok: true as const, drafts }
      }
      return { ok: false as const, error: lastError || 'Resposta inválida da IA.' }
    }

    const makeFallbackProgramDrafts = (answersForRun: any, days: number) => {
      const split = String(answersForRun?.split || '')
      const focus = String(answersForRun?.focus || 'balanced')
      const focusCycle =
        split === 'ppl'
          ? (focus === 'push' ? ['push', 'pull', 'legs'] : focus === 'pull' ? ['pull', 'legs', 'push'] : focus === 'legs' ? ['legs', 'push', 'pull'] : ['push', 'pull', 'legs'])
          : split === 'upper_lower'
            ? (focus === 'lower' ? ['lower', 'upper'] : ['upper', 'lower'])
            : ['balanced']

      const out = []
      for (let i = 0; i < days; i++) {
        const nextFocus = focusCycle[i % focusCycle.length] || focus
        const base = generateWorkoutFromWizard({ ...(answersForRun as any), focus: nextFocus } as any, i)
        out.push(applyFallbackFilter(base, answersForRun.constraints))
      }
      return out
    }

    if (isProgram) {
      const ai = await runProgram({ ...answers }, daysRequested)
      if (ai.ok) return NextResponse.json({ ok: true, drafts: ai.drafts })
      const fallbackDrafts = makeFallbackProgramDrafts({ ...answers }, daysRequested)
      return NextResponse.json({ ok: false, error: ai.error, drafts: fallbackDrafts }, { status: 200 })
    }

    if (variants && variants.length) {
      const ai = await runVariants({ ...answers }, variants)
      if (ai.ok) return NextResponse.json({ ok: true, drafts: ai.drafts })
      const fallbackDrafts = variants.map((lv: string) => {
        const base = generateWorkoutFromWizard({ ...(answers as any), level: lv } as any, 0)
        return applyFallbackFilter(base, answers.constraints)
      })
      return NextResponse.json({ ok: false, error: ai.error, drafts: fallbackDrafts }, { status: 200 })
    }

    const ai = await runSingle({ ...answers })
    if (ai.ok) return NextResponse.json({ ok: true, draft: ai.draft })

    const base = generateWorkoutFromWizard(answers as any, 0)
    const fallback = applyFallbackFilter(base, answers.constraints)
    return NextResponse.json({ ok: false, error: ai.error, draft: fallback }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
