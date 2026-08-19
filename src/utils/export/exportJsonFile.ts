/**
 * @module exportJsonFile
 *
 * Caminho ÚNICO para entregar um arquivo .json ao usuário (backup de treinos,
 * export de um treino só).
 *
 * Por que existe
 * ──────────────
 * O export montava um `Blob`, criava um `<a download>` e chamava `.click()`.
 * Isso funciona no navegador e **não faz absolutamente nada no WKWebView** — no
 * iPhone o menu fechava e nenhum arquivo aparecia: sem share sheet, sem erro,
 * sem pista. Auditoria de 19/08/2026, reproduzido no aparelho.
 *
 * É a MESMA lição que gerou o `exportHtmlAsPdf` em jul/2026 ("salvar PDF salvava
 * a tela do app"): no app nativo, entregar arquivo é Web Share com File ou
 * Capacitor Filesystem — nunca um link de download. O JSON tinha ficado para
 * trás porque ninguém tentou exportar pelo celular.
 *
 * Ordem de tentativas (a primeira que funcionar vence):
 *  1. Web Share API com File — o share sheet do iOS aceita `application/json`,
 *     então o usuário manda para Arquivos, e-mail, WhatsApp…
 *  2. Capacitor Filesystem → salva em "No Meu iPhone/IronTracks" e diz onde.
 *  3. `<a download>` — navegador, onde ele de fato funciona.
 *
 * ⚠️ NUNCA passar `blob:` URL para `navigator.share`: o iOS não resolve e
 * compartilha a página atual da WebView (o bug do PDF). Aqui só vai File.
 */
import { logWarn } from '@/lib/logger'
import { isNativePlatform } from '@/utils/platform'

export type ExportJsonResult =
  | { ok: true; via: 'share-file' | 'filesystem' | 'download' }
  | { ok: false; via: 'cancelled' | 'failed'; error?: string }

export type ExportJsonOptions = {
  /** Conteúdo já serializado. */
  json: string
  /** Nome do arquivo sem extensão. */
  baseFileName: string
  /** Título humano para o share sheet. */
  title?: string
  /** Diálogo do app — usado só para dizer onde o arquivo foi parar. */
  alert?: (msg: string) => void | Promise<void>
}

const isCancel = (e: unknown): boolean => {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return msg.includes('cancel') || msg.includes('abort') || (e instanceof Error && e.name === 'AbortError')
}

export async function exportJsonFile(opts: ExportJsonOptions): Promise<ExportJsonResult> {
  const { json, baseFileName, title, alert } = opts
  const safeBase = (baseFileName || 'irontracks').replace(/\s+/g, '_')
  const fileName = `${safeBase}.json`

  // 1. Share sheet com arquivo de verdade.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (canShare) {
    try {
      const file = new File([new Blob([json], { type: 'application/json' })], fileName, {
        type: 'application/json',
      })
      const canShareFiles =
        typeof (navigator as { canShare?: (d: { files: File[] }) => boolean }).canShare === 'function' &&
        (navigator as { canShare: (d: { files: File[] }) => boolean }).canShare({ files: [file] })
      if (canShareFiles) {
        await navigator.share({ files: [file], title: title || 'Backup IronTracks' })
        return { ok: true, via: 'share-file' }
      }
      // Sem `else` com blob: URL — era exatamente o bug do PDF.
    } catch (e) {
      if (isCancel(e)) return { ok: false, via: 'cancelled' }
      logWarn('exportJsonFile', 'share file failed', e)
    }
  }

  // 2. App nativo sem share de arquivo: salva em Arquivos e diz onde.
  if (isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({
        path: `IronTracks/${fileName}`,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      await alert?.(
        `✅ Backup salvo!\n\nAbra o app "Arquivos" → "No Meu iPhone" → "IronTracks" → ${fileName}.`,
      )
      return { ok: true, via: 'filesystem' }
    } catch (e) {
      logWarn('exportJsonFile', 'filesystem save failed', e)
      await alert?.('Não consegui salvar o arquivo. Tente de novo ou use o app no navegador.')
      return { ok: false, via: 'failed', error: e instanceof Error ? e.message : String(e ?? '') }
    }
  }

  // 3. Navegador — aqui o link de download é o caminho certo.
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true, via: 'download' }
  } catch (e) {
    return { ok: false, via: 'failed', error: e instanceof Error ? e.message : String(e ?? '') }
  }
}
