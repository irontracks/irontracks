import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A landing mostra preço — e o preço é DO BANCO, nunca digitado.
 *
 * O valor cobrado vem de `app_plans` (VIP) e `teacher_tiers` (professores); no
 * iPhone, de produtos da App Store com o mesmo valor. Um "R$ 59,90" escrito na
 * página diverge em silêncio no dia em que a tabela mudar, e preço errado em
 * página pública é promessa ao consumidor. Quatro travas:
 *
 * 1. nenhum valor monetário digitado na PASTA da landing (varre a pasta inteira:
 *    componente novo já nasce coberto);
 * 2. a leitura usa a chave anônima — preço público não precisa de service role;
 * 3. o componente (que vai para o navegador) não importa a camada do servidor;
 * 4. a FIAÇÃO: página lê → Landing recebe → desenha a seção e mostra o link, e o
 *    link do menu aponta para o id que a seção realmente tem. Cada peça passa
 *    verde sozinha com a seção morta.
 */

const RAIZ = process.cwd()
const DIR = join(RAIZ, 'src', 'app', '(landing)')
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

/** Só o código: comentário não pode acusar (nem proteger) a regra que ele explica. */
const codigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

const arquivos = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f) => ({ rel: f, src: codigo(readFileSync(join(DIR, f), 'utf8')) }))

describe('landing — preço não é digitado', () => {
    it('a varredura enxerga a landing e a seção de planos', () => {
        expect(arquivos.length).toBeGreaterThan(5)
        expect(arquivos.some((a) => a.rel.endsWith('Pricing.tsx'))).toBe(true)
    })

    it('nenhum valor monetário escrito à mão na pasta da landing', () => {
        const valorEmTexto = /R\$\s*\d/
        const centavosDaTabela = /\b(2990|5990|9990|29900|59900|99900|4900|9700|17900|24900)\b/
        const culpados = arquivos.flatMap(({ rel, src }) =>
            valorEmTexto.test(src) || centavosDaTabela.test(src) || /\b(29|59|99),90\b/.test(src) ? [rel] : [],
        )
        expect(culpados, 'preço vem de lerPlanosPublicos (app_plans/teacher_tiers), não do JSX').toEqual([])
    })
})

describe('leitura dos planos públicos', () => {
    const leitura = codigo(ler('src', 'lib', 'planos', 'lerPublicos.ts'))

    it('usa a chave ANÔNIMA — nunca a de serviço', () => {
        expect(leitura).toMatch(/env\.supabase\.anonKey/)
        expect(leitura).not.toMatch(/serviceRoleKey/)
        expect(leitura).not.toMatch(/createAdminClient/)
    })

    it('olha o { error } da leitura (o supabase-js não lança)', () => {
        expect(leitura).toMatch(/if\s*\(\s*planos\.error\s*\)\s*throw/)
        expect(leitura).toMatch(/if\s*\(\s*tiers\.error\s*\)\s*throw/)
    })
})

describe('o componente vai ao navegador — não puxa a camada do servidor', () => {
    const pricing = codigo(ler('src', 'app', '(landing)', '_components', 'Pricing.tsx'))

    it('importa só o módulo PURO de planos', () => {
        expect(pricing).toMatch(/from\s+['"]@\/lib\/planos\/publicos['"]/)
        expect(pricing).not.toMatch(/lerPublicos/)
        expect(pricing).not.toMatch(/@supabase\//)
        expect(pricing).not.toMatch(/@\/utils\/env/)
    })

    it('é um componente de cliente (abas e seletor têm estado)', () => {
        expect(ler('src', 'app', '(landing)', '_components', 'Pricing.tsx')).toMatch(/^\s*['"]use client['"]/)
    })
})

describe('fiação: página → landing → seção → menu', () => {
    const page = codigo(ler('src', 'app', '(landing)', 'page.tsx'))
    const landing = codigo(ler('src', 'app', '(landing)', '_components', 'Landing.tsx'))
    const nav = codigo(ler('src', 'app', '(landing)', '_components', 'Nav.tsx'))
    const pricing = codigo(ler('src', 'app', '(landing)', '_components', 'Pricing.tsx'))

    it('a página lê os planos no servidor e entrega à landing', () => {
        expect(page).toMatch(/export default async function Page/)
        expect(page).toMatch(/await lerPlanosPublicos\(\)/)
        expect(page).toMatch(/<Landing\s+planos=\{planos\}/)
    })

    it('a landing só desenha a seção quando há planos (null = some, não preço vazio)', () => {
        expect(landing).toMatch(/\{planos && <Pricing planos=\{planos\} \/>\}/)
    })

    it('o link "Planos" do menu só existe com planos, e aponta para o id da seção', () => {
        expect(landing).toMatch(/<Nav comPlanos=\{planos != null\}/)
        expect(nav).toMatch(/comPlanos \? \[\.\.\.LINKS, LINK_PLANOS\] : LINKS/)
        const ancora = nav.match(/LINK_PLANOS\s*=\s*\{[^}]*href:\s*'#([\w-]+)'/)
        expect(ancora, 'LINK_PLANOS sem âncora').not.toBeNull()
        expect(pricing).toContain(`id="${ancora![1]}"`)
    })
})
