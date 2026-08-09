import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileIncompleteBanner } from '@/components/dashboard/ProfileIncompleteBanner'

/**
 * Aviso de perfil incompleto — auditoria de design, ago/2026.
 *
 * Dois problemas, ambos de tom e não de código:
 *
 * 1. Era VERMELHO abaixo de 40%. Vermelho é a cor de erro e de ação destrutiva.
 *    Perfil incompleto não é erro — é sugestão. Um app de treino que abre com
 *    alerta vermelho diz "você está falhando" antes de qualquer outra coisa.
 * 2. Aparecia nas quatro abas (Treinos, Comunidade, Nutrição, VIP) e não dava
 *    para dispensar. Lembrete que persegue vira ruído, e ruído se aprende a
 *    ignorar — inclusive quando finalmente importa.
 */

const settingsVazio = {} as Parameters<typeof ProfileIncompleteBanner>[0]['settings']

beforeEach(() => {
    localStorage.clear()
})

describe('tom do aviso', () => {
    it('não usa vermelho em nenhuma variação de completude', () => {
        const src = readFileSync(
            join(__dirname, '..', 'ProfileIncompleteBanner.tsx'),
            'utf8',
        )
        expect(src, 'vermelho é erro/destrutivo — isto é sugestão').not.toMatch(/red-\d{3}/)
        expect(src).not.toContain('#f87171')
    })
})

describe('dispensar', () => {
    it('mostra o aviso quando o perfil está incompleto', () => {
        render(<ProfileIncompleteBanner settings={settingsVazio} onComplete={() => { }} />)
        expect(screen.getByText(/Complete seu perfil/i)).toBeInTheDocument()
    })

    it('some ao dispensar e grava a validade', () => {
        render(<ProfileIncompleteBanner settings={settingsVazio} onComplete={() => { }} />)
        fireEvent.click(screen.getByLabelText(/Dispensar aviso/i))
        expect(screen.queryByText(/Complete seu perfil/i)).not.toBeInTheDocument()

        const until = Number(localStorage.getItem('irontracks.profileBanner.dismissedUntil'))
        expect(until).toBeGreaterThan(Date.now())
    })

    it('continua dispensado numa montagem seguinte, dentro da validade', () => {
        localStorage.setItem(
            'irontracks.profileBanner.dismissedUntil',
            String(Date.now() + 3 * 86_400_000),
        )
        render(<ProfileIncompleteBanner settings={settingsVazio} onComplete={() => { }} />)
        expect(screen.queryByText(/Complete seu perfil/i)).not.toBeInTheDocument()
    })

    it('volta quando a validade expira — é lembrete, não silêncio eterno', () => {
        localStorage.setItem(
            'irontracks.profileBanner.dismissedUntil',
            String(Date.now() - 1000),
        )
        render(<ProfileIncompleteBanner settings={settingsVazio} onComplete={() => { }} />)
        expect(screen.getByText(/Complete seu perfil/i)).toBeInTheDocument()
    })
})

describe('alcance', () => {
    it('só é renderizado na aba do dashboard', () => {
        const dash = readFileSync(
            join(__dirname, '..', 'StudentDashboard.tsx'),
            'utf8',
        )
        const linha = dash.split('\n').find((l) => l.includes('<ProfileIncompleteBanner')) || ''
        expect(linha, 'sem o gate de view, o aviso volta a perseguir o usuário pelas abas')
            .toContain("props.view === 'dashboard'")
    })
})
