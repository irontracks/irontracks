import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Já tenho a ficha" no estado VAZIO da lista de treinos.
 *
 * Medido em 29/08/2026, no banco de produção: de quem foi aprovado, logou e
 * nunca criou um treino, **13 chegaram ao `/dashboard` e só 4 abriram o
 * editor**. O import por foto/PDF já existia — mas só depois de abrir o wizard
 * e ler quatro opções, e quem chega com o papel do personal na mão não deveria
 * ter de descobrir que ele cabe ali.
 *
 * Guard de forma: montar o `StudentDashboard` exigiria bootstrap, Supabase e
 * ~40 props. O que se trava aqui é a decisão — o atalho existe, é secundário, e
 * a intenção não vaza para a próxima abertura do wizard.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const semComentarios = (f: string) =>
    f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const DASH = semComentarios(ler('src/components/dashboard/StudentDashboard.tsx'))
const WIZARD = semComentarios(ler('src/components/dashboard/WorkoutWizardModal.tsx'))
const STORE = semComentarios(ler('src/lib/state/modalStore.ts'))

describe('o atalho da ficha existe no estado vazio', () => {
    it('o botão está lá e chama o atalho', () => {
        expect(DASH).toMatch(/abrirWizardNoImport\(\)/)
    })

    it('e fica DENTRO do bloco de lista vazia', () => {
        const vazio = DASH.indexOf('visibleWorkouts.length === 0')
        const atalho = DASH.indexOf('abrirWizardNoImport()')
        expect(vazio).toBeGreaterThan(-1)
        expect(atalho).toBeGreaterThan(vazio)
    })

    it('criar continua sendo a ação PRIMÁRIA', () => {
        // Regra do PR #749: no onboarding, criar é a ação primária. Dois botões
        // dourados lado a lado não priorizam nada — o da ficha é secundário.
        const at = DASH.indexOf('abrirWizardNoImport()')
        const bloco = DASH.slice(at, at + 500)
        expect(bloco, 'o atalho não pode usar o dourado sólido do CTA').not.toMatch(/bg-yellow-500(?!\/)/)
        expect(DASH).toMatch(/bg-yellow-500 px-5 py-3 font-black text-black[\s\S]{0,400}Criar meu primeiro treino/)
    })
})

describe('a intenção não vaza para a próxima abertura', () => {
    it('o wizard abre no import só quando pedido E aberto', () => {
        expect(WIZARD).toMatch(/props\.isOpen && props\.abrirImportDeFoto/)
    })

    it('fechar o wizard limpa a intenção', () => {
        // Sem isso, quem usou o atalho uma vez cairia no import em toda
        // abertura seguinte — inclusive ao clicar em "Criar treino".
        expect(STORE).toMatch(/setCreateWizardOpen:[\s\S]{0,120}createWizardNoImport: false/)
    })

    it('e o shell repassa a flag', () => {
        const SHELL = semComentarios(ler('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'))
        expect(SHELL).toMatch(/abrirImportDeFoto=\{createWizardNoImport\}/)
    })
})
