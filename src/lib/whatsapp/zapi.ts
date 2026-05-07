/**
 * @module zapi
 * Z-API client for sending WhatsApp messages.
 * https://developer.z-api.io/
 */
import { env } from '@/utils/env'
import { logError, logWarn } from '@/lib/logger'

/** Normalizes a Brazilian phone number to E.164 without the "+": 5511999999999 */
export function normalizeBrPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `55${digits}`            // (11) 9xxxx-xxxx
  if (digits.length === 13 && digits.startsWith('55')) return digits
  if (digits.length === 12 && digits.startsWith('55')) return digits
  return null
}

/**
 * Sends a plain-text WhatsApp message via Z-API.
 * Returns true on success, false on any error (non-throwing).
 */
export async function sendWhatsAppText(rawPhone: string, message: string): Promise<boolean> {
  const instanceId = env.zapi.instanceId
  const token = env.zapi.token
  if (!instanceId || !token) {
    logWarn('zapi', 'ZAPI_INSTANCE_ID or ZAPI_TOKEN not configured — skipping send')
    return false
  }

  const phone = normalizeBrPhone(rawPhone)
  if (!phone) {
    logWarn('zapi', 'Invalid BR phone number', { rawPhone })
    return false
  }

  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logError('zapi.sendWhatsAppText', `HTTP ${res.status}`, { phone, body })
      return false
    }
    return true
  } catch (e) {
    logError('zapi.sendWhatsAppText', e, { phone })
    return false
  }
}
