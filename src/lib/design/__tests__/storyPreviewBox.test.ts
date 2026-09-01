/**
 * A prévia do story cabe na tela — e os quatro composers medem igual.
 *
 * Relato do Diogo (01/09/2026): "não consigo mudar os templates nem salvar a
 * foto". Nada estava quebrado: em 390×844 pt o painel inteiro (estilo, layout,
 * POSTAR, BAIXAR) ficava abaixo da dobra, e a prévia — que ocupa quase toda a
 * tela e captura o arraste para mover o card — não deixa rolar a página. A
 * primeira dobra mentia dizendo que a tela terminava ali.
 *
 * O guard trava as duas coisas que fazem o defeito voltar: a medida deixar de
 * depender da ALTURA da viewport, e um composer voltar a escrever a própria.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORY_PREVIEW_BOX, STORY_PREVIEW_ROW } from '../storyPreviewBox'

const COMPOSERS = [
    'src/components/StoryComposer.tsx',
    'src/components/NutritionStoryComposer.tsx',
    'src/components/CardioStoryComposer.tsx',
    'src/components/MetricsStoryComposer.tsx',
]

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('medida da prévia', () => {
    it('é limitada pela ALTURA da viewport, não só por px', () => {
        // Sem o teto por altura, a prévia volta a comer a tela inteira num
        // aparelho de 844 pt e o painel some abaixo da dobra.
        expect(STORY_PREVIEW_BOX).toMatch(/svh/)
        expect(STORY_PREVIEW_ROW).toMatch(/svh/)
    })

    it('mantém o teto em px para telas altas e desktop', () => {
        expect(STORY_PREVIEW_BOX).toMatch(/min\(300px/)
        expect(STORY_PREVIEW_BOX).toMatch(/lg:w-\[340px\]/)
    })

    it('a prévia continua 9/16 — o story é vertical', () => {
        for (const p of COMPOSERS) {
            expect(ler(p), p).toMatch(/STORY_PREVIEW_BOX\} aspect-\[9\/16\]/)
        }
    })
})

describe('guard de classe — os quatro composers usam a fonte única', () => {
    it('nenhum escreve a própria largura de prévia', () => {
        const offenders = COMPOSERS.filter((p) => /max-w-\[300px\]\s+sm:max-w-\[340px\]/.test(ler(p)))
        expect(offenders, 'use STORY_PREVIEW_BOX/ROW').toEqual([])
    })

    it('todos importam a fonte única', () => {
        const faltando = COMPOSERS.filter((p) => !/STORY_PREVIEW_BOX/.test(ler(p)))
        expect(faltando).toEqual([])
    })
})
