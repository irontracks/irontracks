import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const runtime = 'nodejs'

const ZodBodySchema = z
  .object({
    html: z.string().min(1),
    fileName: z.string().optional(),
  })
  .strip()

const sanitizeHtml = (value: unknown): string => {
  try {
    let s = String(value ?? '')
    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    s = s.replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    s = s.replace(/javascript:/gi, '')
    return s
  } catch {
    return ''
  }
}

export async function POST(req: Request) {
  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const { html, fileName } = parsedBody.data!
    const internalSecret = String(process.env.IRONTRACKS_INTERNAL_SECRET || '').trim()
    const provided = String(req.headers.get('x-internal-secret') || '').trim()
    const hasInternal = Boolean(internalSecret && provided && provided === internalSecret)

    if (!hasInternal) {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user?.id) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const htmlText = typeof html === 'string' ? html : ''
    if (!htmlText) {
      return new Response(JSON.stringify({ ok: false, error: 'html required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (htmlText.length > 1_000_000) {
      return new Response(JSON.stringify({ ok: false, error: 'html too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const htmlSafe = sanitizeHtml(htmlText)
    if (!String(htmlSafe || '').trim()) {
      return new Response(JSON.stringify({ ok: false, error: 'html required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const puppeteer = await import('puppeteer')
    let browser = null
    try {
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      const page = await browser.newPage()
      try {
        await page.setJavaScriptEnabled(false)
      } catch {}
      try {
        await page.setRequestInterception(true)
        page.on('request', (request) => {
          try {
            const url = String(request?.url() || '')
            if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
              request.continue()
              return
            }
            request.abort()
          } catch {
            try { request.abort() } catch {}
          }
        })
      } catch {}
      await page.emulateMediaType('screen')
      await page.setContent(htmlSafe, { waitUntil: 'domcontentloaded' })

      const footerTemplate = `
        <div style="width:100%; font-size:9px; padding: 0 10mm; color:#a3a3a3;">
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <span style="letter-spacing:.16em; font-weight:700;">IRONTRACKS</span>
            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
              <span class="pageNumber"></span>/<span class="totalPages"></span>
            </span>
          </div>
        </div>
      `

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate,
        margin: { top: '10mm', bottom: '14mm', left: '10mm', right: '10mm' },
      })

      const safeName = String(fileName || 'IronTracks_Report')
        .trim()
        .replaceAll(/[\r\n"]/g, '')
        .slice(0, 80) || 'IronTracks_Report'

      const body = typeof Buffer !== 'undefined' ? Buffer.from(pdfBuffer as unknown as ArrayBufferLike) : pdfBuffer
      return new Response(body as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
        },
      })
    } finally {
      try { await browser?.close() } catch {}
    }
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: getErrorMessage(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
