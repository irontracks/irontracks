import { NextResponse } from 'next/server'
import { z, ZodError, type ZodTypeAny } from 'zod'

export type Parsed<T> = { data: T | null; response: NextResponse | null }

const serializeZodError = (error: ZodError) => {
  return {
    ok: false as const,
    error: 'invalid_request' as const,
    issues: error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code,
    })),
  }
}

export async function parseJsonBody<TSchema extends ZodTypeAny>(
  req: Request,
  schema: TSchema,
): Promise<Parsed<z.infer<TSchema>>> {
  let raw: unknown = undefined
  try {
    raw = await req.json()
  } catch {}

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { data: null, response: NextResponse.json(serializeZodError(parsed.error), { status: 400 }) }
  }
  return { data: parsed.data, response: null }
}

export function parseSearchParams<TSchema extends ZodTypeAny>(
  req: Request,
  schema: TSchema,
): Parsed<z.infer<TSchema>> {
  const url = new URL(req.url)
  const obj: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    obj[key] = value
  })

  const parsed = schema.safeParse(obj)
  if (!parsed.success) {
    return { data: null, response: NextResponse.json(serializeZodError(parsed.error), { status: 400 }) }
  }
  return { data: parsed.data, response: null }
}

export function parseJsonWithSchema<TSchema extends ZodTypeAny>(raw: unknown, schema: TSchema): z.infer<TSchema> | null {
  let value: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      value = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data
}
