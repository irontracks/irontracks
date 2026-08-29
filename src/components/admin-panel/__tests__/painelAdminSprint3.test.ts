import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sprint 3 da varredura de design da área administrativa.
 *
 * Guards de forma, pelo mesmo motivo do Sprint 1: montar o painel exigiria
 * Supabase, contexto de admin e 15 abas com import dinâmico. O que aparece na
 * tela é conferência visual; o que estes casos travam é o padrão voltar.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const MENU = 'src/components/HeaderActionsMenu.tsx'
const FETCHERS = 'src/components/admin-panel/hooks/useAdminDataFetchers.ts'
const SUBTABS = 'src/components/admin-panel/AdminPanelSubTabs.tsx'

describe('o menu não esconde que você é admin', () => {
    // O COMPORTAMENTO é testado em `lib/user/__tests__/rotuloDePapel.test.ts`.
    // Aqui só a fiação: a primeira versão deste guard era de forma e proibia a
    // forma CORRETA (o regex casava com `isCoach ? 'Coach' : null`, que é o
    // conserto). Regra de sempre: comportamento em função pura, forma só para
    // travar a ligação.
    it('o menu consome a fonte única, não decide por conta', () => {
        const fonte = semComentarios(ler(MENU))
        expect(fonte).toMatch(/rotuloDePapel\(\s*\{/)
        expect(fonte, 'o ternário exclusivo voltou').not.toMatch(/isCoach\s*\?\s*'Coach'\s*:\s*user/)
    })
})

describe('o banner de diagnóstico não despeja exceção na tela', () => {
    it('a mensagem é instrução, não stack', () => {
        const fonte = semComentarios(ler(FETCHERS))
        expect(
            fonte,
            'o banner vermelho exibia a exceção crua com `break-all` — mesma classe varrida em 27/08',
        ).not.toMatch(/setDebugError\(\s*["'`]Erro Catch/)
        expect(fonte).not.toMatch(/setDebugError\([^)]*\+\s*msg/)
    })

    it('e o detalhe continua indo para o log, onde serve', () => {
        expect(semComentarios(ler(FETCHERS))).toMatch(/logError\([^)]*ERRO DE CONEXÃO/)
    })

    it('o banner ainda é alimentado — o guard acima precisa de alvo', () => {
        expect(semComentarios(ler(FETCHERS))).toMatch(/setDebugError\(/)
    })
})

describe('os chips avisam quando há mais fora da tela', () => {
    it('mede o overflow do trilho', () => {
        const fonte = semComentarios(ler(SUBTABS))
        expect(fonte).toMatch(/scrollWidth\s*-\s*\w+\.clientWidth/)
    })

    it('NÃO usa ResizeObserver — jsdom não o tem', () => {
        // Já derrubou três testes de cardio neste repo, e no aparelho seria a
        // tela inteira caindo.
        expect(semComentarios(ler(SUBTABS))).not.toMatch(/ResizeObserver/)
    })

    it('o degradê é decoração: não recebe toque nem é anunciado', () => {
        const fonte = semComentarios(ler(SUBTABS))
        const at = fonte.indexOf('temMais &&')
        expect(at, 'a pista de overflow sumiu — o guard perdeu o alvo').toBeGreaterThan(-1)
        const bloco = fonte.slice(at, at + 400)
        expect(bloco).toContain('pointer-events-none')
        expect(bloco).toContain('aria-hidden')
    })
})
