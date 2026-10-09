import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * GUARD DE CLASSE — todo lugar que ramifica por `assessment_type` conhece 'dexa'.
 *
 * O defeito (06–09/10/2026): o app só conhecia 'full' e 'bia', e QUALQUER outro
 * valor caía em 'full' (dobras) em silêncio — `=== 'bia' ? 'bia' : 'full'`. Um
 * laudo de DEXA (17,0%) entraria na curva e nos deltas das dobras (5,83%).
 *
 * Três ângulos, porque cada um acha o que o outro deixa passar:
 *  1. pelo SÍMBOLO — quem escreve `assessment_type`;
 *  2. pela FORMA do defeito — quem lê %gordura/massa de `assessments` sem pedir o tipo
 *     (as rotas de IA nunca citam `assessment_type`, e o ângulo 1 não as vê);
 *  3. pelo TIPO — `Record<AssessmentMethod, …>` e o `never` do switch fazem o `tsc`
 *     exigir o 'dexa' (não é teste: está em assessmentMethod.ts e assessmentChartData.ts).
 */

const RAIZ = join(__dirname, '..', '..', '..', '..')
const MODULO = 'src/utils/assessment/assessmentMethod.ts'

const walk = (dir: string, out: string[] = []): string[] => {
    for (const nome of readdirSync(dir)) {
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) {
            if (nome === 'node_modules' || nome === '__tests__') continue
            walk(p, out)
        } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) out.push(p)
    }
    return out
}

/** Sem comentários: o guard não pode acusar a documentação que explica o defeito. */
const semComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const ARQUIVOS = walk(join(RAIZ, 'src')).map((f) => ({
    rel: relative(RAIZ, f),
    codigo: semComentarios(readFileSync(f, 'utf8')),
}))

/**
 * Ângulo 1 — quem escreve `assessment_type`. Cada arquivo declara COMO trata o
 * 'dexa': o token que prova o tratamento (ou, em `repassa`, o arquivo que rotula
 * adiante). Arquivo novo que leia o tipo reprova até entrar aqui.
 */
type Entrada = { usa: string[] } | { repassa: string }
const CONSUMIDORES: Record<string, Entrada> = {
    [MODULO]: { usa: ['normalizeAssessmentType'] },
    'src/types/assessment.ts': { usa: ['AssessmentType'] },
    'src/hooks/useAssessment.ts': { usa: ['normalizeAssessmentType'] },
    'src/components/assessment/AssessmentListItem.tsx': { usa: ['normalizeAssessmentType', 'isExternalReport'] },
    'src/components/assessment/AssessmentHistoryModal.tsx': { usa: ['normalizeAssessmentType', 'isExternalReport'] },
    'src/utils/calculations/assessmentPairing.ts': { usa: ['normalizeAssessmentType'] },
    'src/utils/bodyPhoto/bodyFatCrossCheck.ts': { usa: ["'dexa'"] },
    'src/app/api/body-photo/assessments/route.ts': { repassa: 'src/utils/bodyPhoto/bodyFatCrossCheck.ts' },
    'src/utils/ai/userContext.ts': { usa: ['assessmentMethod('] },
    'src/app/api/ai/vip-coach/route.ts': { usa: ['assessmentMethod('] },
    'src/app/api/ai/lab-exam-protocol/route.ts': { usa: ['assessmentMethod('] },
    'src/hooks/useDossier.ts': { repassa: 'src/utils/report/buildDossierHtml.ts' },
    'src/app/app/relatorio/[userId]/page.tsx': { usa: ['assessmentMethod('] },
}

/**
 * Ângulo 2 — leem %gordura/massa de `assessments` e NÃO pedem `assessment_type`.
 * Só entra aqui com motivo, e a lista só ENCOLHE (o teste reprova entrada que
 * deixou de ser verdade).
 */
const SEM_TIPO_DE_PROPOSITO: Record<string, string> = {
    'src/app/api/ai/assessment-report/route.ts':
        'seleciona colunas que NÃO existem (weight_kg, body_fat_pct…): a consulta já falha hoje. Sai daqui quando for consertada.',
    'src/app/api/ai/student-workout/route.ts':
        'idem: weight_kg/body_fat_pct/muscle_mass_kg não existem em assessments.',
}

describe('ângulo 1 — quem escreve assessment_type', () => {
    const quemMenciona = ARQUIVOS.filter((f) => /assessment_type|assessmentType/.test(f.codigo))

    it('não existe colapso binário `=== "bia" ? "bia" : "full"` fora do módulo único', () => {
        const colapsos = ARQUIVOS
            .filter((f) => f.rel !== MODULO)
            .filter((f) => /assessment_type[^;\n]*===\s*['"]bia['"]\s*\?\s*['"]bia['"]\s*:\s*['"]full['"]/.test(f.codigo))
            .map((f) => f.rel)
        expect(colapsos, "o 'dexa' viraria 'full' aqui — use normalizeAssessmentType()").toEqual([])
    })

    it("nenhum tipo fecha a união em 'full' | 'bia'", () => {
        const fechados = ARQUIVOS
            .filter((f) => f.rel !== MODULO)
            // Fechada = termina em 'bia' sem um terceiro membro depois (a definição
            // de AssessmentType continua com `| 'dexa'` e não acusa).
            .filter((f) => /['"]full['"]\s*\|\s*['"]bia['"](?!\s*\|)|['"]bia['"]\s*\|\s*['"]full['"](?!\s*\|)/.test(f.codigo))
            .map((f) => f.rel)
        expect(fechados, "use AssessmentType (types/assessment.ts), que admite 'dexa'").toEqual([])
    })

    it('todo arquivo que lê assessment_type declara como trata o dexa', () => {
        const nao = quemMenciona.map((f) => f.rel).filter((rel) => !(rel in CONSUMIDORES))
        expect(nao, 'consumidor NOVO de assessment_type: acrescente em CONSUMIDORES dizendo o que o dexa faz aqui').toEqual([])
    })

    it('cada entrada do registro é verdade: o arquivo tem o token que prova o tratamento', () => {
        const porRel = new Map(ARQUIVOS.map((f) => [f.rel, f.codigo]))
        const falhas: string[] = []
        for (const [rel, entrada] of Object.entries(CONSUMIDORES)) {
            const codigo = porRel.get(rel)
            if (codigo === undefined) { falhas.push(`${rel}: arquivo não existe mais — tire do registro`); continue }
            if ('usa' in entrada) {
                for (const token of entrada.usa) if (!codigo.includes(token)) falhas.push(`${rel}: falta ${token}`)
            } else {
                const alvo = porRel.get(entrada.repassa)
                if (alvo === undefined) falhas.push(`${rel}: repassa para ${entrada.repassa}, que não existe`)
                else if (!/assessmentMethod\(|'dexa'/.test(alvo)) falhas.push(`${rel}: repassa para ${entrada.repassa}, que não rotula o método`)
            }
        }
        expect(falhas).toEqual([])
    })
})

describe('ângulo 2 — a forma do defeito: %gordura lido sem o tipo', () => {
    const achados = (() => {
        const out: Array<{ rel: string; select: string }> = []
        for (const f of ARQUIVOS) {
            const re = /from\(\s*['"]assessments['"]\s*\)[\s\S]{0,400}?\.select\(\s*(['"`])([\s\S]*?)\1/g
            for (const m of f.codigo.matchAll(re)) out.push({ rel: f.rel, select: m[2] })
        }
        return out
    })()

    const leMedida = (sel: string) => /body_fat|lean_mass|fat_mass|\bbf\b/.test(sel)
    const semTipo = (sel: string) => !/assessment_type/.test(sel) && !/(^|[\s,])\*($|[\s,])/.test(sel)

    it('quem seleciona %gordura/massa de assessments pede assessment_type (ou está na lista com motivo)', () => {
        const novos = achados
            .filter((a) => leMedida(a.select) && semTipo(a.select))
            .map((a) => a.rel)
            .filter((rel) => !(rel in SEM_TIPO_DE_PROPOSITO))
        expect([...new Set(novos)], 'sem o tipo, o método do número é desconhecido: peça assessment_type e rotule').toEqual([])
    })

    it('a lista de exceções só encolhe: entrada que passou a pedir o tipo sai dela', () => {
        const ainda = new Set(achados.filter((a) => leMedida(a.select) && semTipo(a.select)).map((a) => a.rel))
        const obsoletas = Object.keys(SEM_TIPO_DE_PROPOSITO).filter((rel) => !ainda.has(rel))
        expect(obsoletas).toEqual([])
    })

    it('o detector enxerga o que deve: as rotas de IA e o dossiê estão entre os achados', () => {
        // Sem este caso o ângulo 2 poderia "passar" por não achar NADA (regex quebrada).
        const rels = new Set(achados.map((a) => a.rel))
        for (const esperado of [
            'src/utils/ai/userContext.ts',
            'src/app/api/ai/vip-coach/route.ts',
            'src/app/api/ai/lab-exam-protocol/route.ts',
            'src/app/api/body-photo/assessments/route.ts',
            'src/hooks/useDossier.ts',
        ]) expect(rels.has(esperado), esperado).toBe(true)
    })
})
