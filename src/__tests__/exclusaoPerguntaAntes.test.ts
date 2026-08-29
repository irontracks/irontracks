import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Apagar dado do usuário PERGUNTA antes.
 *
 * Auditoria de 28/08/2026: em Configurações, o 🗑 da academia chamava
 * `deleteGym` direto — um toque apagava a academia e, com ela, o check-in por
 * QR. A avaliação física, na mesma área do app, já confirmava; a diferença era
 * acidente, não desenho.
 *
 * ── ESCOPO, e por que este é estreito ──────────────────────────────────────
 * Só `src/components/**` — as TELAS, onde o dedo do usuário dispara a ação.
 * Hooks e libs ficam de fora porque ali o `.delete()` é a mecânica, e quem
 * pergunta é quem tem a tela. Guard que acusa uso correto é afrouxado na
 * primeira semana (ver "os oito jeitos de errar" no CLAUDE.md), e a versão
 * larga deste teste acusaria todo repositório de dados do app.
 */

const COMPONENTES = join(process.cwd(), 'src', 'components')

/**
 * Telas que apagam SEM perguntar, com motivo.
 *
 * Só encolhe. Entrada nova aqui é uma decisão de produto — "esta exclusão pode
 * ser feita sem confirmar" —, não um jeito de calar o teste.
 */
const PODE_APAGAR_SEM_PERGUNTAR: Record<string, string> = {
    'dashboard/nutrition/useCustomFoods.ts':
        'alimento da biblioteca pessoal: o cadastro é de 10 segundos e a tela oferece recriar na hora',
}

const listar = (dir: string, out: string[] = []): string[] => {
    for (const entrada of readdirSync(dir)) {
        const cheio = join(dir, entrada)
        if (statSync(cheio).isDirectory()) {
            if (entrada === '__tests__') continue
            listar(cheio, out)
        } else if (/\.(ts|tsx)$/.test(entrada)) {
            out.push(cheio)
        }
    }
    return out
}

const semComentarios = (codigo: string): string =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('guard: exclusão na tela pergunta antes', () => {
    it('nenhuma tela apaga dado do usuário sem confirmação', () => {
        const culpados: string[] = []
        for (const arquivo of listar(COMPONENTES)) {
            const rel = arquivo.slice(COMPONENTES.length + 1)
            if (PODE_APAGAR_SEM_PERGUNTAR[rel]) continue
            const codigo = semComentarios(readFileSync(arquivo, 'utf8'))
            if (!/\.delete\(\)/.test(codigo)) continue
            // `confirm(` do DialogContext, ou um passo de confirmação na própria
            // tela (o padrão `confirmDeleteId` da avaliação física).
            const pergunta = /confirm\(|confirmDelete|deleteConfirm|setConfirm/i.test(codigo)
            if (!pergunta) culpados.push(rel)
        }
        expect(
            culpados,
            'apagar dado do usuário num toque: use o `confirm` do DialogContext ' +
            '(ou um passo de confirmação na tela) antes do `.delete()`',
        ).toEqual([])
    })

    it('a allowlist só tem entrada que existe — lista morta vira papel de parede', () => {
        const existentes = new Set(listar(COMPONENTES).map((f) => f.slice(COMPONENTES.length + 1)))
        const mortas = Object.keys(PODE_APAGAR_SEM_PERGUNTAR).filter((f) => !existentes.has(f))
        expect(mortas, 'entrada da allowlist aponta para arquivo que não existe mais').toEqual([])
    })
})
