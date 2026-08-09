import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Guard do `vercel.json` (ago/2026).
 *
 * Uma chave `_comment_buildCommand` — comentário, nada mais — derrubou TRÊS
 * deploys de produção seguidos:
 *
 *   The `vercel.json` schema validation failed with the following message:
 *   should NOT have additional property `_comment_buildCommand`
 *
 * O detalhe cruel: o PREVIEW do PR ficou verde. A validação de schema só
 * reprova no deploy de produção, então nada avisa antes do merge.
 *
 * Este teste é o aviso que faltava: roda no CI, antes do merge.
 */

const CONFIG = join(__dirname, '..', '..', 'vercel.json')

/** Propriedades aceitas pelo schema da Vercel (docs/project-configuration). */
const PERMITIDAS = new Set([
    '$schema', 'buildCommand', 'bunVersion', 'cleanUrls', 'crons', 'devCommand',
    'fluid', 'framework', 'functions', 'functionFailoverRegions', 'headers',
    'ignoreCommand', 'images', 'installCommand', 'outputDirectory', 'public',
    'redirects', 'bulkRedirectsPath', 'regions', 'rewrites', 'trailingSlash',
    'git', 'github', 'buildEnv',
])

describe('vercel.json', () => {
    const raw = readFileSync(CONFIG, 'utf8')
    const cfg = JSON.parse(raw) as Record<string, unknown>

    it('é JSON válido', () => {
        expect(cfg).toBeTypeOf('object')
    })

    it('não tem chave fora do schema — inclusive "comentário"', () => {
        const desconhecidas = Object.keys(cfg).filter((k) => !PERMITIDAS.has(k))
        expect(desconhecidas, 'chave extra no vercel.json reprova o deploy de PRODUÇÃO (o preview passa)').toEqual([])
    })

    it('não tem chave de comentário disfarçada', () => {
        const comentarios = Object.keys(cfg).filter((k) => /^(_|\/\/|#)/.test(k))
        expect(comentarios, 'JSON não tem comentário — documente em docs/vercel-build.md').toEqual([])
    })

    it('o build ainda carrega o NODE_OPTIONS que evita o OOM', () => {
        // Sem isso o build de produção volta a morrer sem aviso, e como o app
        // nativo carrega o front do servidor, trava todos os usuários.
        expect(String(cfg.buildCommand || '')).toMatch(/max-old-space-size=\d{4,}/)
    })
})
