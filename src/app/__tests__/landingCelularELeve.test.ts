import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { REELS, HERO_VIDEO, HERO_CAPA, videoDo, capaDo } from '../(landing)/_components/reels'

/**
 * A landing no celular e na rede de academia.
 *
 * Substitui o guard do card antigo (`comercialCardMobile`), cujo componente saiu
 * no redesign de 26/09/2026. O defeito que ele travava continua valendo como
 * CLASSE: grade em `style` inline é imune a media query — em 375px o card de
 * duas colunas espremia o texto em 119px. E o redesign trouxe um risco novo:
 * ~20 vídeos na página. Com `src` e `autoPlay` desde o início, a abertura
 * baixaria ~15 MB antes de mostrar o primeiro.
 */

const DIR = join(process.cwd(), 'src', 'app', '(landing)')
const PUBLIC = join(process.cwd(), 'public')
const arquivos = readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f) => ({ rel: f, src: readFileSync(join(DIR, f), 'utf8') }))

/** Tags de abertura <video ...>, respeitando chaves aninhadas. */
const tagsDeVideo = (src: string): string[] => {
    const out: string[] = []
    for (const m of src.matchAll(/<video\b/g)) {
        let i = (m.index ?? 0) + m[0].length
        let prof = 0
        while (i < src.length) {
            const c = src[i]
            if (c === '{' || c === '(' || c === '[') prof++
            else if (c === '}' || c === ')' || c === ']') prof--
            else if (c === '>' && prof <= 0) {
                out.push(src.slice(m.index ?? 0, i))
                break
            }
            i++
        }
    }
    return out
}

describe('grade que o celular consegue quebrar', () => {
    it('nenhuma grade com colunas em style inline', () => {
        const culpados = arquivos.filter(({ src }) => /gridTemplateColumns\s*:/.test(src)).map((a) => a.rel)
        expect(culpados, 'use classes (grid-cols-*) com breakpoint: inline não colapsa no celular').toEqual([])
    })
})

describe('armadilhas de CSS medidas no navegador (26/09/2026)', () => {
    const layout = readFileSync(join(DIR, 'layout.tsx'), 'utf8')
    const css = readFileSync(join(DIR, 'landing.css'), 'utf8')

    it('html/body cortam a rolagem lateral com clip, não hidden', () => {
        // `overflow-x: hidden` no html/body transforma o body em contêiner de
        // rolagem e quebra `position: sticky`: o vídeo de "Como funciona" subia
        // junto com a página.
        expect(layout).toMatch(/overflow-x:\s*clip/)
        expect(layout).not.toMatch(/overflow-x:\s*hidden/)
    })

    it('fonte que aponta para variável do next/font vive em @theme inline', () => {
        // As --lf-* do next/font nascem no CONTÊINER da landing. Num @theme
        // comum o Tailwind declara `--font-sans: var(--lf-body)` em :root, onde
        // --lf-body não existe: a fonte vira inválida e o navegador cai na
        // padrão ("pré-carregada e não usada" no console).
        const blocos = [...css.matchAll(/@theme(\s+inline)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)]
        const comuns = blocos.filter((b) => !b[1]).map((b) => b[2]).join('\n')
        const inline = blocos.filter((b) => b[1]).map((b) => b[2]).join('\n')
        expect(comuns, 'var(--lf-*) fora de @theme inline resolve na raiz, onde não existe').not.toMatch(/var\(--lf-/)
        expect(inline).toMatch(/--font-sans:\s*var\(--lf-body\)/)
    })
})

describe('vídeos que não derrubam a abertura', () => {
    const videos = arquivos.flatMap(({ rel, src }) => tagsDeVideo(src).map((tag) => ({ rel, tag })))

    it('a varredura enxerga o player', () => {
        // Ancorado no que FICA: sem isto, apagar o player deixaria os de baixo verdes.
        expect(videos.length).toBeGreaterThan(0)
    })

    it('todo vídeo é mudo, inline e sem autoPlay de atributo', () => {
        for (const { rel, tag } of videos) {
            expect(tag, `${rel}: sem muted o iPhone não deixa tocar sozinho`).toMatch(/\bmuted\b/)
            expect(tag, `${rel}: sem playsInline o iPhone abre em tela cheia`).toMatch(/\bplaysInline\b/)
            expect(tag, `${rel}: autoPlay baixa na abertura — o play é pela visibilidade`).not.toMatch(/\bautoPlay\b/)
        }
    })

    it('todo vídeo declara preload e só o destaque pede metadata', () => {
        for (const { rel, tag } of videos) {
            expect(tag, `${rel}: sem preload o navegador decide sozinho quanto baixar`).toMatch(/\bpreload=/)
            expect(tag).not.toMatch(/preload=["']auto["']/)
        }
    })
})

describe('orçamento dos arquivos de vídeo', () => {
    /** Medido na conversão: 0,8–1,3 MB por reel (540×960, sem áudio). */
    const TETO_REEL = 1.8 * 1024 * 1024
    const TETO_HERO = 3 * 1024 * 1024
    const TETO_TOTAL = 20 * 1024 * 1024

    const noDisco = (url: string) => join(PUBLIC, url.replace(/^\//, ''))

    it('cada reel listado tem vídeo e capa no public/', () => {
        const faltando = REELS.flatMap((r) =>
            [videoDo(r.slug), capaDo(r.slug)].filter((u) => !existsSync(noDisco(u))),
        )
        expect(faltando).toEqual([])
        expect(existsSync(noDisco(HERO_VIDEO))).toBe(true)
        expect(existsSync(noDisco(HERO_CAPA))).toBe(true)
    })

    it('nenhum reel passa do teto — 4K original no site travaria o 4G', () => {
        const pesados = REELS.map((r) => ({ slug: r.slug, bytes: statSync(noDisco(videoDo(r.slug))).size }))
            .filter((v) => v.bytes > TETO_REEL)
        expect(pesados).toEqual([])
        expect(statSync(noDisco(HERO_VIDEO)).size).toBeLessThanOrEqual(TETO_HERO)
    })

    it('a pasta inteira cabe no orçamento', () => {
        const pasta = join(PUBLIC, 'landing', 'reels')
        const total = readdirSync(pasta).reduce((soma, f) => soma + statSync(join(pasta, f)).size, 0)
        expect(total).toBeLessThanOrEqual(TETO_TOTAL)
    })
})
