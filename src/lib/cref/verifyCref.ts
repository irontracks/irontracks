import { logError } from '@/lib/logger'

const CREF9_LOOKUP_URL =
  'https://listasconfef.org.br/spw/CREF9/ConsultaCadastral/TelaConsultaPublicaCompleta.aspx'

const REQUEST_TIMEOUT_MS = 8_000
const NAME_CONNECTORS = new Set(['DA', 'DAS', 'DE', 'DO', 'DOS', 'E'])

export type CrefVerificationStatus = 'verified' | 'invalid' | 'manual_review'

export interface CrefVerificationResult {
  status: CrefVerificationStatus
  canContinue: boolean
  normalizedCref?: string
  message: string
  professionalName?: string
  category?: string
  registrationStatus?: string
}

interface ParsedCref {
  digits: string
  state: string
  normalized: string
}

interface Cref9Record {
  registration: string
  professionalName: string
  category: string
  status: string
}

type FetchLike = typeof fetch

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDigits(value: string): string {
  const withoutLeadingZeros = value.replace(/^0+(?=\d)/, '')
  return withoutLeadingZeros.padStart(6, '0')
}

export function parseCref(value: string): ParsedCref | null {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^CREF\s*/, '')
    .trim()

  const state = raw.match(/\/\s*([A-Z]{2})\s*$/)?.[1] ?? raw.match(/^([A-Z]{2})\s*-/)?.[1]
  const digits = raw.match(/\d{1,8}/)?.[0]

  if (!state || !digits || !/^[A-Z]{2}$/.test(state)) return null

  const normalizedDigits = normalizeDigits(digits)
  const category = raw.match(/-\s*([A-Z])\s*\//)?.[1] ?? 'G'

  return {
    digits: normalizedDigits,
    state,
    normalized: `${normalizedDigits}-${category}/${state}`,
  }
}

function normalizeNameTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NAME_CONNECTORS.has(token))
}

export function namesMatch(providedName: string, officialName: string): boolean {
  const provided = normalizeNameTokens(providedName)
  const official = new Set(normalizeNameTokens(officialName))

  if (provided.length < 2 || official.size < 2) return false

  const firstAndLastMatch = official.has(provided[0]) && official.has(provided[provided.length - 1])
  const sharedTokens = provided.filter((token) => official.has(token)).length
  const minimumShared = Math.min(3, provided.length)

  return firstAndLastMatch && sharedTokens >= minimumShared
}

function getAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, 'i'))
  return match ? decodeHtml(match[1]) : null
}

function buildCref9Form(html: string, registrationDigits: string): URLSearchParams | null {
  const form = html.match(/<form\b[^>]*\bid=["']form1["'][^>]*>[\s\S]*?<\/form>/i)?.[0]
  if (!form) return null

  const params = new URLSearchParams()
  for (const input of form.match(/<input\b[^>]*>/gi) ?? []) {
    const name = getAttribute(input, 'name')
    if (!name) continue

    const type = (getAttribute(input, 'type') ?? 'text').toLowerCase()
    if (['button', 'file', 'image', 'submit'].includes(type)) continue

    params.append(name, getAttribute(input, 'value') ?? '')
  }

  params.set('ctl00$ContentPlaceHolder1$Callbackconsulta$txtConsultaTotal', registrationDigits)
  params.set('ctl00$ContentPlaceHolder1$Callbackconsulta$btnConsultaTotal', 'Pesquisar')

  return params
}

export function parseCref9Response(html: string, expectedDigits: string): Cref9Record | null {
  const expected = normalizeDigits(expectedDigits)
  const rows = html.match(/<tr\b[^>]*class=["'][^"']*dxgvDataRow[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) ?? []

  for (const row of rows) {
    const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []
    const [registrationCell, nameCell, categoryCell, statusCell] = cells
    if (!registrationCell || !nameCell || !categoryCell || !statusCell) continue

    const registration = stripHtml(registrationCell)
    const digits = registration.match(/\d{1,8}/)?.[0]
    if (!digits || normalizeDigits(digits) !== expected) continue

    return {
      registration,
      professionalName: stripHtml(nameCell),
      category: stripHtml(categoryCell),
      status: stripHtml(statusCell),
    }
  }

  return null
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function lookupCref9(parsed: ParsedCref, fetchImpl: FetchLike): Promise<Cref9Record | null> {
  const pageResponse = await fetchWithTimeout(fetchImpl, CREF9_LOOKUP_URL, {
    headers: { 'User-Agent': 'IronTracks/1.0 CREF verification' },
    cache: 'no-store',
  })
  if (!pageResponse.ok) throw new Error('cref_lookup_page_unavailable')

  const pageHtml = await pageResponse.text()
  const form = buildCref9Form(pageHtml, parsed.digits)
  if (!form) throw new Error('cref_lookup_form_changed')

  const sessionCookie = pageResponse.headers.get('set-cookie')?.split(';', 1)[0]
  const resultResponse = await fetchWithTimeout(fetchImpl, CREF9_LOOKUP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: CREF9_LOOKUP_URL,
      'User-Agent': 'IronTracks/1.0 CREF verification',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: form,
    cache: 'no-store',
  })
  if (!resultResponse.ok) throw new Error('cref_lookup_result_unavailable')

  return parseCref9Response(await resultResponse.text(), parsed.digits)
}

export async function verifyCref(
  cref: string,
  fullName: string,
  fetchImpl: FetchLike = fetch,
): Promise<CrefVerificationResult> {
  const parsed = parseCref(cref)
  if (!parsed) {
    return {
      status: 'invalid',
      canContinue: false,
      message: 'Informe o CREF completo, incluindo a UF. Ex.: 004955-G/PR.',
    }
  }

  if (normalizeNameTokens(fullName).length < 2) {
    return {
      status: 'invalid',
      canContinue: false,
      normalizedCref: parsed.normalized,
      message: 'Informe o nome completo antes de verificar o CREF.',
    }
  }

  if (parsed.state !== 'PR') {
    return {
      status: 'manual_review',
      canContinue: true,
      normalizedCref: parsed.normalized,
      message: 'A consulta automática está disponível para CREF9/PR. Este cadastro seguirá para análise manual.',
    }
  }

  try {
    const record = await lookupCref9(parsed, fetchImpl)
    if (!record) {
      return {
        status: 'invalid',
        canContinue: false,
        normalizedCref: parsed.normalized,
        message: 'CREF não encontrado no cadastro público oficial.',
      }
    }

    if (record.status.trim().toUpperCase() !== 'ATIVO') {
      return {
        status: 'invalid',
        canContinue: false,
        normalizedCref: parsed.normalized,
        professionalName: record.professionalName,
        category: record.category,
        registrationStatus: record.status,
        message: `O CREF informado está com situação ${record.status}.`,
      }
    }

    if (!namesMatch(fullName, record.professionalName)) {
      return {
        status: 'invalid',
        canContinue: false,
        normalizedCref: parsed.normalized,
        professionalName: record.professionalName,
        category: record.category,
        registrationStatus: record.status,
        message: 'O CREF foi localizado, mas o nome não confere com o cadastro oficial.',
      }
    }

    return {
      status: 'verified',
      canContinue: true,
      normalizedCref: parsed.normalized,
      professionalName: record.professionalName,
      category: record.category,
      registrationStatus: record.status,
      message: 'CREF ativo e nome confirmado no CREF9/PR.',
    }
  } catch (error) {
    logError('cref/verify', error, { state: parsed.state })
    return {
      status: 'manual_review',
      canContinue: true,
      normalizedCref: parsed.normalized,
      message: 'Não foi possível consultar o CREF agora. O cadastro seguirá para análise manual.',
    }
  }
}
