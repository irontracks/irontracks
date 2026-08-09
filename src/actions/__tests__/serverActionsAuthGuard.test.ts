import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Toda Server Action precisa checar autorização — ago/2026.
 *
 * Uma função com `'use server'` NÃO é código interno: o Next publica um
 * endpoint HTTP para ela, e qualquer um que descubra o id da action pode
 * chamá-la direto, sem passar pela tela. `clearAllStudents()` sem guard seria
 * "apague todos os alunos" exposto na internet.
 *
 * Hoje o único arquivo com `'use server'` é `admin-actions.ts`, e as 14 funções
 * dele chamam `checkAdmin()`. Este guard existe para o dia em que alguém
 * adicionar a 15ª — ou marcar outro arquivo como server — e esquecer.
 *
 * Nota para quem vier depois: os outros arquivos de `src/actions/` NÃO são
 * server actions apesar do nome. São helpers de cliente que fazem `fetch` para
 * rotas de API (o guard está lá). Auditoria de 07/08/2026 tropeçou nisso: pelo
 * nome da pasta parecia haver 12 actions sem autorização, e não havia nenhuma.
 */

const DIR = join(__dirname, '..')

/** Chamadas que constituem verificação de autorização nesta base. */
const VERIFICADORES = [
    'checkAdmin(',
    'requireRole(',
    'requireUser(',
    'requireAdmin(',
    'canCoachStudent(',
]

function arquivosServer(): string[] {
    return readdirSync(DIR)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .filter((f) => {
            const src = readFileSync(join(DIR, f), 'utf8')
            return /^\s*['"]use server['"]/m.test(src)
        })
        .sort()
}

/** Corpo de cada `export async function` do arquivo. */
function funcoesExportadas(src: string): Array<{ nome: string; corpo: string }> {
    const partes = src.split(/\nexport async function /)
    return partes.slice(1).map((p) => ({ nome: p.split('(')[0].trim(), corpo: p }))
}

describe('server actions — autorização', () => {
    const arquivos = arquivosServer()

    it('a varredura encontra os arquivos server (se zerar, o padrão mudou)', () => {
        expect(arquivos.length).toBeGreaterThan(0)
        expect(arquivos).toContain('admin-actions.ts')
    })

    it.each(arquivosServer())('%s: toda função exportada verifica autorização', (arquivo) => {
        const src = readFileSync(join(DIR, arquivo), 'utf8')
        const semGuard = funcoesExportadas(src)
            .filter(({ corpo }) => !VERIFICADORES.some((v) => corpo.includes(v)))
            .map(({ nome }) => nome)
        expect(semGuard, 'server action sem checagem = endpoint HTTP aberto').toEqual([])
    })

    it('o verificador do admin realmente exige o papel admin', () => {
        const src = readFileSync(join(DIR, 'admin-actions.ts'), 'utf8')
        // `checkAdmin` é o pescoço por onde as 14 passam: se ele afrouxar, todas
        // afrouxam de uma vez e nenhum outro teste aqui perceberia.
        const helper = src.slice(src.indexOf('async function checkAdmin'), src.indexOf('export async function'))
        expect(helper).toContain("requireRole(['admin'])")
        expect(helper).toMatch(/if \(!auth\.ok\) throw/)
    })

    it('nenhuma função exportada escapa da varredura por usar arrow function', () => {
        // `export const x = async () => {}` não casa com o split acima. Se esse
        // estilo aparecer num arquivo server, o guard fica cego — falhe alto.
        for (const arquivo of arquivos) {
            const src = readFileSync(join(DIR, arquivo), 'utf8')
            expect(src, `${arquivo} usa export const arrow — ajuste o guard`).not.toMatch(
                /export const \w+\s*=\s*async/,
            )
        }
    })
})
