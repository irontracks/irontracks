import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Um modal de método, UM renderer (06/09/2026).
 *
 * O modal do Cluster estava desenhado DUAS vezes: em `Modals.tsx` e em
 * `ModalsComplexMethods.tsx` — e `Modals.tsx` monta `<ModalsComplexMethods />`,
 * então com `clusterModal` setado abriam DOIS diálogos no mesmo z-index, com
 * dois focus traps. A cópia do `Modals.tsx` era a ANTIGA: sem preservar reps
 * no "Resetar pesos", sem o estado do descanso por bloco, sem `max-h` flex.
 * Como o segundo vinha depois no DOM, o usuário via o novo — e o velho ficava
 * embaixo recebendo foco. Achado da auditoria de 05/09 (Fable 5.1), que o
 * relatório deixou em aberto e a conferência de código fechou.
 *
 * A classe: cada chave `xxxModal` do contexto é renderizada (`{xxxModal && (`)
 * em EXATAMENTE um dos arquivos de modais. Duplicar reprova; sumir (zero)
 * também — modal sem renderer é botão morto.
 */
const DIR = join(process.cwd(), 'src/components/workout')
const ARQUIVOS = ['Modals.tsx', 'ModalsSimpleMethods.tsx', 'ModalsComplexMethods.tsx']

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function ocorrencias(): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  for (const f of ARQUIVOS) {
    const src = semComentarios(readFileSync(join(DIR, f), 'utf8'))
    for (const m of src.matchAll(/\{([a-zA-Z]+Modal) && \(/g)) {
      const k = m[1]
      mapa.set(k, [...(mapa.get(k) ?? []), f])
    }
  }
  return mapa
}

describe('um modal de método, um renderer', () => {
  const mapa = ocorrencias()

  it('a varredura enxerga os modais (não é vácuo)', () => {
    expect(mapa.size).toBeGreaterThanOrEqual(12)
    expect(mapa.has('clusterModal')).toBe(true)
  })

  it('nenhuma chave xxxModal é renderizada em mais de um arquivo', () => {
    const duplicados = [...mapa.entries()].filter(([, fs]) => fs.length > 1)
    expect(duplicados, 'dois renderers = dois diálogos abertos ao mesmo tempo').toEqual([])
  })

  it('o Cluster mora só no ModalsComplexMethods (a versão que preserva reps)', () => {
    expect(mapa.get('clusterModal')).toEqual(['ModalsComplexMethods.tsx'])
  })
})
