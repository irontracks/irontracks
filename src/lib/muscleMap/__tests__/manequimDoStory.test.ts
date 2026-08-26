/**
 * Guards do manequim do Story — o corpo que substitui a foto.
 *
 * ⚠️ **Limite declarado:** jsdom não implementa `canvas.getContext('2d')`, então
 * NADA aqui prova o que aparece na tela. O que se cobre é (1) o PLANO — quais
 * camadas pintam e com que opacidade —, (2) a GEOMETRIA das duas vistas e (3) a
 * FIAÇÃO até o composer. O resultado visual é conferência no aparelho.
 *
 * O guard de classe da tabela existe porque, ao escrever isto, a mesma tabela
 * "músculo → PNG" estava copiada em QUATRO arquivos (a tela do mapa, o
 * pré-carregador do PDF, o gerador de HTML do PDF e o manequim que eu ia
 * escrever). As quatro estavam iguais — e é assim que toda deriva começa.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { planMannequinLayers, mannequinLayout, MANNEQUIN_SRC } from '../mannequinCanvas'
import { ratioToOpacity } from '../overlays'
import type { SessionMuscles } from '../sessionMuscles'

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

const semComentarios = (code: string): string =>
    code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const muscles = (m: Record<string, number>): SessionMuscles =>
    Object.fromEntries(
        Object.entries(m).map(([id, ratio]) => [id, { setsEq: ratio, ratio }]),
    ) as SessionMuscles

describe('plano de camadas do manequim', () => {
    it('só pinta músculo com volume — o resto do corpo fica apagado', () => {
        const layers = planMannequinLayers('front', muscles({ chest: 1, biceps: 0.4 }))
        expect(layers.map((l) => l.file).sort()).toEqual(['front-biceps.png', 'front-chest.png'])
    })

    it('músculo mais volumoso pinta mais forte', () => {
        const [forte, fraco] = planMannequinLayers('front', muscles({ chest: 1, biceps: 0.3 }))
            .sort((a, b) => b.opacity - a.opacity)
        expect(forte.file).toBe('front-chest.png')
        expect(forte.opacity).toBeGreaterThan(fraco.opacity)
    })

    it('deltoide frontal e lateral dividem o PNG e entram uma vez só', () => {
        // Duas camadas iguais empilhadas somam opacidade: o ombro acenderia
        // mais que o peitoral treinado em dobro.
        const layers = planMannequinLayers('front', muscles({ delts_front: 0.5, delts_side: 0.5 }))
        expect(layers).toHaveLength(1)
        expect(layers[0].opacity).toBe(ratioToOpacity(0.5))
    })

    it('a vista de costas não pinta músculo da frente', () => {
        expect(planMannequinLayers('back', muscles({ chest: 1 }))).toEqual([])
    })

    it('sessão sem músculo nenhum não devolve camada', () => {
        expect(planMannequinLayers('front', {})).toEqual([])
        expect(planMannequinLayers('back', {})).toEqual([])
    })
})

describe('geometria das duas vistas', () => {
    const CANVAS_W = 1080
    const CANVAS_H = 1920
    const geo = mannequinLayout(CANVAS_W, CANVAS_H)

    it('frente e costas cabem lado a lado, sem sobrepor e sem vazar', () => {
        expect(geo.front.dx).toBeGreaterThan(0)
        expect(geo.front.dx + geo.front.dw).toBeLessThanOrEqual(geo.back.dx)
        expect(geo.back.dx + geo.back.dw).toBeLessThanOrEqual(CANVAS_W)
    })

    it('o corpo fica na METADE DE CIMA — embaixo mora o bloco de métricas', () => {
        // O gradiente do template escurece a partir de ~35% da altura; corpo
        // que desce demais é engolido por ele e pelos cards.
        expect(geo.dy + geo.dh).toBeLessThan(CANVAS_H * 0.62)
    })

    it('não distorce o corpo: a caixa mantém a proporção do recorte', () => {
        const proporcaoRecorte = MANNEQUIN_SRC.w / MANNEQUIN_SRC.h
        expect(geo.front.dw / geo.dh).toBeCloseTo(proporcaoRecorte, 2)
    })
})

describe('a tabela músculo → PNG tem UM dono', () => {
    const DONO = 'src/lib/muscleMap/overlays.ts'
    const NOME_DE_OVERLAY = /['"`](?:front|back)-[a-z_]+\.png['"`]/

    it('ninguém mais escreve nome de arquivo de overlay', () => {
        const infratores: string[] = []
        for (const file of walk(SRC)) {
            const rel = file.replace(`${process.cwd()}/`, '')
            if (rel === DONO) continue
            if (NOME_DE_OVERLAY.test(semComentarios(readFileSync(file, 'utf8')))) infratores.push(rel)
        }
        expect(
            infratores,
            `importe FRONT_OVERLAYS/BACK_OVERLAYS de ${DONO} — a tabela já esteve copiada em 4 arquivos`,
        ).toEqual([])
    })

    it('o dono da tabela existe', () => {
        expect(() => statSync(join(process.cwd(), DONO))).not.toThrow()
    })
})

describe('fiação: o manequim entra pela mesma porta da foto', () => {
    const composer = semComentarios(
        readFileSync(join(SRC, 'components/StoryComposer.tsx'), 'utf8'),
    )

    it('o blob do manequim vira File e é entregue ao loadMedia', () => {
        // Sem isto o botão pode montar o corpo perfeito e não mostrar nada:
        // `loadMedia` é quem coloca a imagem no composer.
        expect(composer).toMatch(/buildMannequinBlob\s*\(/)
        expect(composer).toMatch(/loadMedia\(\s*new File\(\s*\[\s*blob\s*\]/)
    })

    it('o botão está ligado ao handler', () => {
        expect(composer).toMatch(/onClick=\{useMannequin\}/)
    })

    it('desabilita quando a sessão não tem músculo reconhecido', () => {
        // Manequim todo apagado não é "o meu treino": é um boneco cinza.
        expect(composer).toMatch(/disabled=\{[^}]*!hasMuscles[^}]*\}/)
    })
})
