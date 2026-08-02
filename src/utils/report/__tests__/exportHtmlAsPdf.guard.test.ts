/**
 * Guards do export de PDF.
 *
 * Bug que originou (jul/2026, iPhone): "salvar PDF" do relatório salvava a TELA
 * DO APP. Causa: o iOS recusa `text/html` em `navigator.canShare({ files })`, o
 * código caía em `navigator.share({ url: blobUrl })`, e o iOS — sem resolver
 * `blob:` — compartilhava a página atual da WebView.
 *
 * O guard varre a CLASSE do problema (qualquer arquivo que combine
 * `navigator.share` com uma object URL), não só os três chamadores corrigidos:
 * o próximo que reimplementar o export cai aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Remove comentários — senão a própria documentação do bug vira "ofensor". */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('guard: navigator.share nunca recebe blob: URL', () => {
  it('nenhum navigator.share passa a chave `url`', () => {
    // Por que proibir a chave inteira, e não só `blob:`: a object URL quase nunca
    // é criada no mesmo arquivo que compartilha (em WorkoutReport ela vem do
    // useReportData), então casar "createObjectURL no mesmo arquivo" deixava o
    // bug passar — foi exatamente o que aconteceu na 1ª versão deste guard.
    // Compartilhar arquivo (`files`) é o caminho correto e continua liberado.
    // Compartilhar uma URL https REAL é legítimo — só a object URL quebra.
    // Allowlist explícita para que um arquivo novo nunca escape por acidente.
    const ALLOWED = new Set([
      'src/components/settings/ReferralSection.tsx', // link https de indicação
    ])
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const code = stripComments(readFileSync(file, 'utf8'))
      if (!code.includes('navigator.share')) continue
      const rel = file.replace(SRC, 'src')
      if (ALLOWED.has(rel)) continue
      if (/navigator\.share\(\s*\{[^}]*\burl\s*:/.test(code)) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  it('os chamadores de export usam o helper único', () => {
    const callers = [
      'components/WorkoutReport.tsx',
      'hooks/useWorkoutExport.ts',
      'components/admin-panel/hooks/useAdminTemplateOps.ts',
    ]
    for (const rel of callers) {
      const code = readFileSync(join(SRC, rel), 'utf8')
      expect(code, `${rel} deve usar exportHtmlAsPdf`).toContain('exportHtmlAsPdf')
    }
  })
})

describe('exportHtmlAsPdf — ordem de tentativas', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { open: () => null })
    vi.stubGlobal('document', { createElement: () => ({ click: () => {}, remove: () => {}, style: {} }), body: { appendChild: () => {} } })
    // Não stubar `URL` inteiro: o resolvedor de módulos do Vitest usa `new URL()`.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('usa o PDF nativo do iOS quando o build tem o método', async () => {
    const sharePdfFromHtml = vi.fn().mockResolvedValue({ shared: true, unsupported: false, error: '' })
    vi.doMock('@/utils/native/irontracksNative', () => ({ sharePdfFromHtml }))
    vi.doMock('@/utils/platform', () => ({ isNativePlatform: () => true }))
    vi.doMock('@/lib/logger', () => ({ logWarn: vi.fn() }))

    const { exportHtmlAsPdf } = await import('../exportHtmlAsPdf')
    const res = await exportHtmlAsPdf({ html: '<p>oi</p>', title: 'Treino', baseFileName: 'treino' })

    expect(sharePdfFromHtml).toHaveBeenCalledOnce()
    expect(sharePdfFromHtml.mock.calls[0][1]).toBe('treino.pdf')
    expect(res).toEqual({ ok: true, via: 'native-pdf' })
  })

  it('build antigo (unsupported) cai no Filesystem — nunca em blob: URL', async () => {
    const writeFile = vi.fn().mockResolvedValue({ uri: 'file:///x' })
    vi.doMock('@/utils/native/irontracksNative', () => ({
      sharePdfFromHtml: vi.fn().mockResolvedValue({ shared: false, unsupported: true, error: '' }),
    }))
    vi.doMock('@/utils/platform', () => ({ isNativePlatform: () => true }))
    vi.doMock('@/lib/logger', () => ({ logWarn: vi.fn() }))
    vi.doMock('@capacitor/filesystem', () => ({
      Filesystem: { writeFile },
      Directory: { Documents: 'DOCUMENTS' },
      Encoding: { UTF8: 'utf8' },
    }))
    // Sem canShare de arquivos — exatamente o caso do iPhone.
    const share = vi.fn()
    vi.stubGlobal('navigator', { share, canShare: () => false })
    vi.stubGlobal('File', class { constructor(public parts: unknown[], public name: string) {} })

    const { exportHtmlAsPdf } = await import('../exportHtmlAsPdf')
    const res = await exportHtmlAsPdf({ html: '<p>oi</p>', title: 'Treino', baseFileName: 'treino', alert: () => {} })

    expect(res).toEqual({ ok: true, via: 'filesystem' })
    expect(writeFile).toHaveBeenCalledOnce()
    // O ponto do bug: share NUNCA pode ser chamado com uma url.
    expect(share).not.toHaveBeenCalled()
  })
})
