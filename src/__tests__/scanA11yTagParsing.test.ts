/**
 * Guard do parser de tags do `scripts/scan-a11y.mjs` (ago/2026).
 *
 * O scanner usava `/<input\b([^>]*?)\/?>/`. Um handler inline
 * (`onChange={(e) => ...}`) tem `>` dentro das chaves, então a "tag" terminava
 * ali e todo atributo posterior — `placeholder`, `aria-label` — ficava
 * invisível. Resultado: 54 avisos de "campo sem rótulo" dos quais 47 eram
 * campos JÁ rotulados.
 *
 * Isso é pior que não ter scanner: relatório que grita lobo treina o dono a
 * ignorar o arquivo inteiro, e aí o aviso verdadeiro passa junto.
 *
 * O teste roda o scanner de verdade sobre fixtures temporárias, em vez de
 * reimplementar a regra — reimplementação passaria verde com o bug de volta.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCANNER = join(process.cwd(), 'scripts', 'scan-a11y.mjs')

let dir = ''

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'a11yscan-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function escanear(nome: string, jsx: string): string {
    // Uma fixture por chamada: o scanner varre o diretório inteiro, e sobra de
    // teste anterior faria um caso "passar" por causa do arquivo do outro.
    rmSync(join(dir, 'src'), { recursive: true, force: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', nome), jsx, 'utf8')
    const env = { ...process.env, A11Y_SCAN_ROOT: join(dir, 'src') }
    try {
        return execFileSync('node', [SCANNER], { cwd: dir, encoding: 'utf8', env })
    } catch (e) {
        // O scanner sai com código != 0 quando acha algo — a saída é o que importa.
        const err = e as { stdout?: string }
        return err.stdout ?? ''
    }
}

describe('scan-a11y — atributos depois de handler inline', () => {
    it('enxerga aria-label que vem DEPOIS de um onChange com arrow function', () => {
        const saida = escanear('ComAria.tsx', `
export const C = () => (
  <input
    inputMode="decimal"
    value={v}
    onChange={(e) => { const n = f(e.target.value); set((p) => ({ ...p, n })) }}
    aria-label="Peso da série"
  />
)
`)
        expect(saida).not.toContain('sem aria-label nem id')
    })

    it('enxerga placeholder depois do handler e classifica como INFO, não AVISO', () => {
        const saida = escanear('ComPlaceholder.tsx', `
export const C = () => (
  <input
    value={v}
    onChange={(e) => set((p) => (p ? { ...p, v: e.target.value } : p))}
    placeholder="Minis (ex.: 2)"
  />
)
`)
        expect(saida).not.toContain('sem aria-label nem id')
        expect(saida).toContain('só com placeholder')
    })

    it('ainda acusa o campo REALMENTE mudo (o guard precisa poder falhar)', () => {
        const saida = escanear('Mudo.tsx', `
export const C = () => (
  <input value={v} onChange={(e) => set(e.target.value)} className="w-full" />
)
`)
        expect(saida).toContain('sem aria-label nem id')
    })
})

describe('scan-a11y — link com texto dinâmico', () => {
    it('não acusa "só ícone" quando o filho é {obj.prop} ao lado do ícone', () => {
        const saida = escanear('LinkTexto.tsx', `
export const C = () => (
  <a href={c.url} target="_blank" rel="noopener noreferrer" className="x">
    {c.title}
    <ExternalLink size={10} />
  </a>
)
`)
        expect(saida).not.toContain('link sem descrição acessível')
    })

    it('ainda acusa link que é só ícone', () => {
        const saida = escanear('LinkIcone.tsx', `
export const C = () => (
  <a href={c.url} className="x"><Play size={14} /></a>
)
`)
        expect(saida).toContain('link sem descrição acessível')
    })
})
