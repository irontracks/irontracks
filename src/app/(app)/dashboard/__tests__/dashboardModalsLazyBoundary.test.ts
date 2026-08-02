/**
 * Guard de bundle: o shell do dashboard (IronTracksAppClientImpl + DashboardModals)
 * NÃO pode importar estaticamente nenhum módulo que importe framer-motion.
 *
 * Por quê: o shell entra no bundle inicial — o app nativo carrega o front
 * remoto, então cada KB aqui é tempo de abertura em 4G. Em ago/2026 o
 * QuickViewExerciseList (usa `Reorder` do framer-motion) vazou pro bundle
 * inicial por uma cadeia de imports estáticos: Impl → DashboardModals →
 * QuickViewExerciseList. O fix foi `dynamic()`; este teste impede a volta —
 * de QUALQUER módulo com framer-motion, não só desse.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const SRC = path.resolve(__dirname, '../../../..')
const SHELL_FILES = [
    path.resolve(__dirname, '../IronTracksAppClientImpl.tsx'),
    path.resolve(__dirname, '../DashboardModals.tsx'),
]

/** Especificadores de import ESTÁTICO (ignora os dentro de dynamic()/import()). */
function staticImportSpecifiers(source: string): string[] {
    const out: string[] = []
    const re = /^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) out.push(m[1])
    return out
}

function resolveToFile(spec: string, fromDir: string): string | null {
    let base: string
    if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = path.resolve(fromDir, spec)
    else return null // pacote npm — não é alvo do guard transitivo
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
        const candidate = base + ext
        if (existsSync(candidate)) return candidate
    }
    return null
}

describe('fronteira lazy do shell do dashboard', () => {
    for (const shellFile of SHELL_FILES) {
        const shellName = path.basename(shellFile)

        it(`${shellName} não importa framer-motion direto`, () => {
            const specs = staticImportSpecifiers(readFileSync(shellFile, 'utf8'))
            expect(specs).not.toContain('framer-motion')
        })

        it(`${shellName} não importa estaticamente módulo que usa framer-motion`, () => {
            const source = readFileSync(shellFile, 'utf8')
            const offenders: string[] = []
            for (const spec of staticImportSpecifiers(source)) {
                const file = resolveToFile(spec, path.dirname(shellFile))
                if (!file) continue
                const childSpecs = staticImportSpecifiers(readFileSync(file, 'utf8'))
                if (childSpecs.includes('framer-motion')) offenders.push(spec)
            }
            expect(offenders, `imports estáticos que arrastam framer-motion pro bundle inicial — troque por dynamic(): ${offenders.join(', ')}`).toEqual([])
        })
    }
})
