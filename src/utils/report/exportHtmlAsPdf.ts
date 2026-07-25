/**
 * @module exportHtmlAsPdf
 *
 * Caminho ÚNICO para transformar um HTML de relatório/plano em PDF salvo pelo
 * usuário. Existe porque três telas (relatório de treino, export de plano,
 * painel admin) reimplementavam a mesma sequência e divergiram em silêncio —
 * a mesma família de bug dos 14 renderers de série.
 *
 * O bug que originou o módulo (jul/2026, reportado no iPhone): "salvar PDF do
 * relatório" salvava a TELA DO APP. Causa: no WKWebView `window.print()` não
 * existe e o share sheet do iOS recusa `text/html`, então
 * `navigator.canShare({ files })` devolvia false e o código caía em
 * `navigator.share({ url: blobUrl })`. O iOS não resolve `blob:` e compartilha
 * a página atual da WebView — daí o PDF sair com o app dentro.
 *
 * ⚠️ NUNCA passar uma `blob:` URL para `navigator.share`. Um guard de teste
 * (`__tests__/exportHtmlAsPdf.guard.test.ts`) varre o repo inteiro por isso.
 *
 * Ordem de tentativas:
 *  1. iOS nativo → `sharePdfFromHtml` gera `application/pdf` de verdade.
 *  2. Web Share API com File (só quando o iOS/Android aceita o tipo).
 *  3. Capacitor Filesystem → salva em Arquivos e avisa onde (padrão que o PDF
 *     de avaliação física já usava e que funcionava).
 *  4. Desktop → nova aba + diálogo de impressão.
 */
import { logWarn } from '@/lib/logger'
import { isNativePlatform } from '@/utils/platform'
import { sharePdfFromHtml } from '@/utils/native/irontracksNative'

export type ExportHtmlAsPdfOptions = {
  /** HTML completo e autocontido (imagens já em base64). */
  html: string
  /** Título humano, usado no share sheet. */
  title: string
  /** Nome base do arquivo, sem extensão. */
  baseFileName: string
  /** Diálogo do app; usado só para instruir onde o arquivo foi parar. */
  alert?: (msg: string) => void | Promise<void>
}

export type ExportHtmlAsPdfResult =
  | { ok: true; via: 'native-pdf' | 'share-file' | 'filesystem' | 'print-window' }
  | { ok: false; via: 'cancelled' | 'failed'; error?: string }

const isCancel = (e: unknown): boolean => {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return msg.includes('cancel') || msg.includes('abort') || (e instanceof Error && e.name === 'AbortError')
}

export async function exportHtmlAsPdf(opts: ExportHtmlAsPdfOptions): Promise<ExportHtmlAsPdfResult> {
  const { html, title, baseFileName, alert } = opts
  const safeBase = (baseFileName || 'IronTracks').replace(/\s+/g, '_')

  // 1. iOS nativo — PDF de verdade. `unsupported` cobre builds antigos do
  //    TestFlight que ainda não têm o método Swift: seguimos para o próximo
  //    passo em vez de estourar "plugin is not implemented on ios".
  const native = await sharePdfFromHtml(html, `${safeBase}.pdf`)
  if (native.shared) return { ok: true, via: 'native-pdf' }
  if (!native.unsupported && native.error) {
    // Chamou o método e ele falhou de verdade (≠ build antigo). Registra e cai
    // pro caminho web — silenciar aqui foi o que escondeu o bug original.
    logWarn('exportHtmlAsPdf', 'native pdf failed', native.error)
  } else if (!native.unsupported && !native.error) {
    // Método existe e o usuário fechou o share sheet sem escolher nada.
    return { ok: false, via: 'cancelled' }
  }

  // 2. Web Share API com arquivo — só quando a plataforma aceita o tipo.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (canShare) {
    try {
      const file = new File([new Blob([html], { type: 'text/html' })], `${safeBase}.html`, { type: 'text/html' })
      const canShareFiles =
        typeof (navigator as { canShare?: (d: { files: File[] }) => boolean }).canShare === 'function' &&
        (navigator as { canShare: (d: { files: File[] }) => boolean }).canShare({ files: [file] })
      if (canShareFiles) {
        await navigator.share({ files: [file], title: `${title} • IronTracks` })
        return { ok: true, via: 'share-file' }
      }
      // Sem `else` com blob: URL — era exatamente o bug. Segue pro Filesystem.
    } catch (e) {
      if (isCancel(e)) return { ok: false, via: 'cancelled' }
      logWarn('exportHtmlAsPdf', 'share file failed', e)
    }
  }

  // 3. App nativo sem share de arquivo: salva em Arquivos e diz onde está.
  if (isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({
        path: `IronTracks/${safeBase}.html`,
        data: html,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      await alert?.(
        `✅ Relatório salvo!\n\nAbra o app "Arquivos" → "No Meu iPhone" → "IronTracks".\n\nDe lá dá pra abrir e usar Compartilhar → Imprimir para salvar como PDF.`
      )
      return { ok: true, via: 'filesystem' }
    } catch (e) {
      logWarn('exportHtmlAsPdf', 'filesystem save failed', e)
    }
  }

  // 4. Desktop — nova aba + diálogo de impressão (Salvar como PDF).
  try {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const win = typeof window !== 'undefined' ? window.open(url, '_blank') : null
    if (win) {
      setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch (e) {
          logWarn('exportHtmlAsPdf', 'print window failed', e)
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }, 500)
      return { ok: true, via: 'print-window' }
    }
    // Pop-up bloqueado: baixa o arquivo.
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeBase}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true, via: 'print-window' }
  } catch (e) {
    return { ok: false, via: 'failed', error: e instanceof Error ? e.message : String(e ?? '') }
  }
}
