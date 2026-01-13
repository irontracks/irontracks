export const runtime = 'nodejs'

import { createClient } from '@/utils/supabase/server'

export async function POST(req) {
  try {
    const { html, fileName } = await req.json()
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

    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(htmlText, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
    await browser.close()

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName || 'IronTracks_Report'}.pdf"`
      }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
