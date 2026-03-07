export type ActionResult<T = void> =
  | ({ ok: true; data: T; error?: string } & Record<string, unknown>)
  | ({ ok: false; error: string; data?: T } & Record<string, unknown>)

export type ActionResultWithMessage<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string }

export type PaginatedResult<T> =
  | {
      ok: true
      data: T[]
      count: number
      hasMore: boolean
    }
  | { ok: false; error: string }

export type ActionData<T extends ActionResult<unknown>> = T extends { ok: true; data: infer D } ? D : never
