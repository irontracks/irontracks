import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Fiação do import de dieta por JSON.
 *
 * O COMPORTAMENTO do parser está em `lib/nutrition/__tests__/importDietJson.test.ts`
 * — 28 casos sobre função pura. Aqui trava-se o que só a ligação garante:
 * o botão existe, é grátis, e o payload vai para a rota que já sabe salvar.
 *
 * Guard de forma porque montar o `NutritionMixer` exigiria Supabase, imports
 * dinâmicos e ~20 props: um teste de render ali mediria o harness (é a mesma
 * decisão registrada no CLAUDE.md para esta tela).
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const MIXER = semComentarios(ler('src/components/dashboard/nutrition/NutritionMixer.tsx'))
const MODAL = semComentarios(ler('src/components/dashboard/nutrition/DietJsonImportModal.tsx'))

describe('o import é grátis — e o gate prova isso', () => {
    it('não depende do gate de GERAR, que exige meta salva e o dia de hoje', () => {
        expect(MIXER).toMatch(/const canImportDiet = !!canViewMacros\s*$/m)
    })

    it('o botão aparece sob o gate do import, não sob o da geração', () => {
        // Ancorado na AÇÃO do botão, não na palavra "Importar" — que aparece
        // em mais de um lugar no arquivo e fatiava o trecho errado.
        const at = MIXER.indexOf('setImportOpen(true)')
        expect(at, 'o botão sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        expect(MIXER.slice(Math.max(0, at - 300), at)).toMatch(/canImportDiet && \(/)
    })

    it('o caminho do JSON não passa por rota de IA — é isso que o torna grátis', () => {
        // Desde 29/08/2026 o modal tem DOIS caminhos: o JSON (local, grátis) e
        // a foto/PDF (Gemini, gateado). O guard antigo proibia IA no arquivo
        // inteiro e passou a reprovar o caminho pago legítimo — hoje ele mira
        // só no fluxo do texto.
        const ini = MODAL.indexOf('const salvar')
        expect(ini, 'o salvamento sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const corpo = MODAL.slice(ini, MODAL.indexOf('if (!open) return null', ini))
        expect(corpo, 'salvar o JSON não pode custar IA').not.toMatch(/\/api\/ai\//)
    })

    it('e a ÚNICA rota de IA do modal é a da foto/PDF', () => {
        const rotas = [...MODAL.matchAll(/'\/api\/ai\/[^']+'/g)].map((m) => m[0])
        expect(rotas).toEqual(["'/api/ai/diet-photo-extract'"])
    })
})

describe('o JSON colado vai para a rota que já sabe salvar', () => {
    it('posta no endpoint do plano próprio', () => {
        expect(MODAL).toMatch(/fetch\(\s*'\/api\/nutrition\/diet-plan'/)
    })

    it('envia o payload do normalizador, não o texto cru', () => {
        // A rota valida com Zod e recusa o que não bate; mandar o texto do
        // usuário direto trocaria um erro explicado por um 400 mudo.
        expect(MODAL).toMatch(/importarDietaDeJson\s*\(/)
        expect(MODAL).toMatch(/body:\s*JSON\.stringify\(payload\)/)
    })

    it('o botão de salvar fica desabilitado enquanto não há payload válido', () => {
        expect(MODAL).toMatch(/disabled=\{!payload \|\| salvando\}/)
    })
})

describe('o usuário sabe o que vai acontecer antes de tocar', () => {
    it('avisa que o plano atual será substituído — a rota arquiva o anterior', () => {
        expect(MODAL).toMatch(/substitui o seu plano atual/i)
    })

    it('mostra a prévia do que entrou', () => {
        expect(MODAL).toMatch(/resumoDoImport\s*\(/)
    })

    it('e repassa os avisos de corte do normalizador', () => {
        expect(MODAL).toMatch(/analise\.avisos\.map/)
    })
})

describe('o campo de JSON é código, não texto livre', () => {
    it('usa o preset que desliga a autocorreção', () => {
        // O teclado do iOS renomearia as chaves e quebraria o parse — é a mesma
        // classe que já mordeu os nomes de exercício (CLAUDE.md, 16/08/2026).
        expect(MODAL).toMatch(/\{\.\.\.codeFieldProps\}/)
    })
})

describe('o prompt de conversão é parte do produto', () => {
    it('existe e descreve o formato canônico', () => {
        // Quem abre este modal normalmente tem o PDF do nutricionista, não o
        // JSON. Sem o prompt pronto, a feature só serve a quem já sabe o
        // formato — ou seja, quase ninguém.
        expect(MODAL).toMatch(/PROMPT_DE_CONVERSAO/)
        for (const chave of ['planName', 'meals', 'items', 'grams', 'calories', 'weekday']) {
            expect(MODAL, `o prompt não menciona "${chave}"`).toContain(chave)
        }
    })
})
