import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão de produto (03/08/2026) — o "Mapa de Treinos" dizia sempre
 * "Nenhum check-in neste período", que lê como "você não treinou".
 *
 * O vazio tinha DUAS causas e a mensagem única escondia a que importa: sem
 * academia salva o check-in é IMPOSSÍVEL. Números da base no dia: 10 dos 11
 * usuários com GPS e check-in automático LIGADOS, `user_gyms` com ZERO linhas,
 * `gym_checkins` com zero em consequência. O cadastro funciona (testado ponta a
 * ponta no simulador) — faltava o card apontar o caminho.
 *
 * O terceiro caso é falha de rede: o `.catch(() => {})` original engolia o erro
 * e o card acusava vazio como se fosse dado confirmado.
 */

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, back: vi.fn() }) }))

import WorkoutHeatMap from '../WorkoutHeatMap'

const jsonOk = (body: unknown) => Promise.resolve({ json: () => Promise.resolve(body) })

/** Roteia por URL: o componente busca check-ins E academias no mesmo efeito. */
const mockFetch = (opts: { checkins?: unknown; gyms?: unknown; checkinFails?: boolean }) => {
  const fetchMock = vi.fn((url: string) => {
    if (String(url).includes('/api/gps/gyms')) {
      return jsonOk({ ok: true, gyms: opts.gyms ?? [] })
    }
    if (opts.checkinFails) return Promise.reject(new Error('network down'))
    return jsonOk({ ok: true, checkins: opts.checkins ?? [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const recentCheckin = () => ({
  latitude: -25.44,
  longitude: -49.28,
  checked_in_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  user_gyms: { name: 'Smart Fit' },
})

describe('WorkoutHeatMap — o vazio precisa dizer QUAL vazio', () => {
  beforeEach(() => { pushMock.mockClear() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sem academia cadastrada: ensina o passo que falta e oferece o cadastro', async () => {
    mockFetch({ gyms: [], checkins: [] })
    render(<WorkoutHeatMap userId="u1" />)

    expect(await screen.findByText(/Cadastre sua academia para começar/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cadastrar academia/i })).toBeTruthy()
    // O texto genérico NÃO pode aparecer aqui — é ele que escondia a causa real.
    expect(screen.queryByText('Nenhum check-in neste período')).toBeNull()
  })

  it('o botão leva pro perfil, onde vive o cadastro de academia', async () => {
    mockFetch({ gyms: [], checkins: [] })
    render(<WorkoutHeatMap userId="u1" />)

    fireEvent.click(await screen.findByRole('button', { name: /Cadastrar academia/i }))
    expect(pushMock).toHaveBeenCalledWith('/dashboard/profile')
  })

  it('COM academia e sem check-in no período: mensagem genérica, sem CTA de cadastro', async () => {
    mockFetch({ gyms: [{ id: 'g1', name: 'Smart Fit' }], checkins: [] })
    render(<WorkoutHeatMap userId="u1" />)

    expect(await screen.findByText('Nenhum check-in neste período')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cadastrar academia/i })).toBeNull()
  })

  it('falha de rede NÃO vira "sem check-in" — o card diz que não conseguiu carregar', async () => {
    mockFetch({ checkinFails: true })
    render(<WorkoutHeatMap userId="u1" />)

    expect(await screen.findByText(/Não foi possível carregar seus check-ins/i)).toBeTruthy()
    expect(screen.queryByText('Nenhum check-in neste período')).toBeNull()
    expect(screen.queryByRole('button', { name: /Cadastrar academia/i })).toBeNull()
  })

  it('com check-in no período mostra as estatísticas, não o vazio', async () => {
    mockFetch({ gyms: [{ id: 'g1' }], checkins: [recentCheckin()] })
    render(<WorkoutHeatMap userId="u1" />)

    await waitFor(() => expect(screen.getByText('Smart Fit')).toBeTruthy())
    expect(screen.getByText('Check-ins')).toBeTruthy()
    expect(screen.queryByText('Nenhum check-in neste período')).toBeNull()
  })

  it('academias falhando não derruba o card nem inventa o CTA', async () => {
    // gyms responde !ok → contagem desconhecida. Sem saber, o card não pode
    // afirmar "cadastre sua academia" (o usuário pode ter uma).
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      String(url).includes('/api/gps/gyms')
        ? jsonOk({ ok: false })
        : jsonOk({ ok: true, checkins: [] }),
    ))
    render(<WorkoutHeatMap userId="u1" />)

    expect(await screen.findByText('Nenhum check-in neste período')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cadastrar academia/i })).toBeNull()
  })
})

describe('source-guard: adicionar academia não pode falhar em silêncio', () => {
  it('addGym avisa quando o GPS não devolve posição', () => {
    const src = readFileSync('src/components/settings/GymSettingsSection.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

    const block = src.slice(src.indexOf('const addGym'), src.indexOf('const deleteGym'))
    const noPos = block.slice(block.indexOf('if (!pos)'), block.indexOf('lat = pos.latitude'))
    // O return calado era o bug: botão piscava "Salvando..." e nada acontecia.
    expect(noPos).toMatch(/setActionError\(/)
  })
})
