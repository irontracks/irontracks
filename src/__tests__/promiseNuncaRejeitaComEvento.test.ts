/**
 * Guard de CLASSE: nenhuma Promise pode ser rejeitada com um DOM `Event`.
 *
 * O bug que originou (24/08/2026, produção, iPhone/WKWebView): o Sentry recebeu
 *
 *     Event `Event` (type=error) captured as promise rejection    /dashboard
 *
 * sem stack, sem mensagem e sem dizer QUAL recurso falhou. `reject` passado
 * direto a um handler de evento (`img.onerror = reject`) entrega o evento como
 * motivo da rejeição — e um `Event` não tem `message` nem `stack`, então tanto
 * o painel quanto o diálogo do app (`getErrorMessage` → `String(error)` →
 * `[object Event]`) ficam ilegíveis.
 *
 * A regra é estreita de propósito: **rejeitar com `Error`**. Ouvir o evento e
 * decidir o que fazer segue liberado.
 *
 * ⚠️ Guard da CLASSE, não da instância: varre `src/` inteiro em vez de listar os
 * três arquivos conhecidos em 24/08. Guard que só olha o que eu já achei é a
 * armadilha que deixou o "Baixar PDF" morto por meses e o FINALIZAR coberto
 * pelo descanso — a pergunta certa é "onde ele NÃO olha?".
 */
import { describe, it, expect } from 'vitest'
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

/**
 * Fora comentários — senão o guard acusa a própria documentação que explica por
 * que o padrão é proibido (jeito nº 2 de escrever guard falso neste repo).
 */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/**
 * `onerror = reject`, `onabort = reject`, `addEventListener('error', reject)`.
 * O que passa é `() => reject(new Error(...))`: aí o motivo é um Error.
 */
const OFFENDERS: Array<{ re: RegExp; what: string }> = [
  { re: /\bon(?:error|abort|timeout)\s*=\s*reject\b/g, what: 'handler = reject' },
  { re: /addEventListener\(\s*['"](?:error|abort|timeout)['"]\s*,\s*reject\s*[,)]/g, what: "addEventListener('error', reject)" },
  // `onerror = (e) => reject(e)` — repassa o evento com um passo no meio.
  { re: /\bon(?:error|abort|timeout)\s*=\s*\(\s*(\w+)\s*\)\s*=>\s*reject\s*\(\s*\1\s*\)/g, what: 'reject(evento)' },
]

describe('guard: Promise nunca rejeita com DOM Event', () => {
  it('nenhum arquivo passa `reject` a um handler de evento', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const { re, what } of OFFENDERS) {
        re.lastIndex = 0
        if (re.test(code)) offenders.push(`${file.replace(SRC, 'src')} (${what})`)
      }
    }
    expect(
      offenders,
      'rejeite com Error: `onerror = () => reject(new Error("..."))` — um Event não tem message nem stack'
    ).toEqual([])
  })

  it('a varredura de fato alcança os arquivos (guard que não olha nada passa verde)', () => {
    // Sem este caso, um `walk` quebrado deixaria o teste acima verde para sempre.
    const files = walk(SRC)
    expect(files.length).toBeGreaterThan(500)
    expect(files.some((f) => f.endsWith('utils/report/fetchLogoDataUrl.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('components/stories/StoryCreatorModal.tsx'))).toBe(true)
  })
})
