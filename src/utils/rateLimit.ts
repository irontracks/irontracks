import { createAdminClient } from '@/utils/supabase/admin'

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

// Helper para pegar IP (mantido como estava)
export const getRequestIp = (req: Request) => {
  try {
    const xff = String(req.headers.get('x-forwarded-for') || '').trim()
    if (xff) return xff.split(',')[0].trim()
  } catch {}
  try {
    const real = String(req.headers.get('x-real-ip') || '').trim()
    if (real) return real
  } catch {}
  return ''
}

export const checkRateLimit = async (key: string, max: number, windowMs: number): Promise<RateLimitResult> => {
  const admin = createAdminClient()
  
  try {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_ms: windowMs
    })

    if (error) {
      console.error('Rate limit error:', error)
      // Fail open (allow request if rate limit fails) or closed depending on requirements
      // Here we fail open to not block users on system error, but log it
      return { 
        allowed: true, 
        remaining: 1, 
        resetAt: Date.now() + windowMs, 
        retryAfterSeconds: 0 
      }
    }

    // O retorno da RPC é JSONB, precisamos garantir a tipagem
    const result = data as any
    
    return {
      allowed: !!result.allowed,
      remaining: Number(result.remaining) || 0,
      resetAt: Number(result.reset_at) || (Date.now() + windowMs),
      retryAfterSeconds: Number(result.retry_after_seconds) || 0
    }
  } catch (err) {
    console.error('Rate limit exception:', err)
    return { 
      allowed: true, 
      remaining: 1, 
      resetAt: Date.now() + windowMs, 
      retryAfterSeconds: 0 
    }
  }
}
