import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

import { SettingsGymGeofenceSection } from '../SettingsSections'

/**
 * Regressão de 03/08/2026 — a academia favorita do dono ficou salva como
 * "Minha academia", nome que ele nunca digitou.
 *
 * Duas coisas somadas: o campo era opcional e caía num fallback silencioso
 * (`nameDraft || 'Minha academia'`), e o placeholder era um nome plausível
 * ("Smart Fit Centro") no MESMO tom dos rótulos — parecia valor preenchido. Quem
 * olhava a tela via um nome no campo, apertava capturar, e levava outro.
 *
 * O nome não é decorativo: é ele que aparece no aviso de chegada na academia.
 */

const noop = async () => {}

const renderSection = (draft: Record<string, unknown> = {}) => {
  const setValue = vi.fn()
  const capture = vi.fn(async () => ({ lat: -25.42, lng: -49.27 }))
  const requestPermission = vi.fn(async () => 'authorizedAlways')
  render(
    <SettingsGymGeofenceSection
      draft={draft}
      setValue={setValue}
      onCaptureCurrentLocation={capture}
      onRequestAlwaysPermission={requestPermission}
      onOpenAppSettings={noop}
    />,
  )
  return { setValue, capture, requestPermission }
}

const captureButton = () => screen.getByRole('button', { name: /localização atual/i })

describe('academia favorita — o nome tem que ser o que o usuário digitou', () => {
  it('campo vazio: recusa a captura e explica, em vez de inventar um nome', async () => {
    const { setValue, capture, requestPermission } = renderSection()

    fireEvent.click(captureButton())

    expect(await screen.findByText(/Dê um nome pra essa academia/i)).toBeTruthy()
    // Nada de GPS nem de escrita: o fluxo para ANTES de pedir permissão.
    expect(requestPermission).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
  })

  it('só espaços também não passa (o trim é o que decide)', async () => {
    const { setValue, capture } = renderSection()

    fireEvent.change(screen.getByLabelText('Nome da academia favorita'), { target: { value: '   ' } })
    fireEvent.click(captureButton())

    expect(await screen.findByText(/Dê um nome pra essa academia/i)).toBeTruthy()
    expect(capture).not.toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
  })

  it('com nome digitado: grava EXATAMENTE o que foi digitado e liga o geofence', async () => {
    const { setValue, capture } = renderSection()

    fireEvent.change(screen.getByLabelText('Nome da academia favorita'), { target: { value: '  Smart Fit Água Verde  ' } })
    fireEvent.click(captureButton())

    await waitFor(() => expect(capture).toHaveBeenCalled())
    expect(setValue).toHaveBeenCalledWith('favoriteGymName', 'Smart Fit Água Verde')
    expect(setValue).toHaveBeenCalledWith('favoriteGymLat', -25.42)
    expect(setValue).toHaveBeenCalledWith('favoriteGymLng', -49.27)
    expect(setValue).toHaveBeenCalledWith('gymGeofenceEnabled', true)
    // O fallback antigo não pode aparecer em hipótese nenhuma.
    expect(setValue).not.toHaveBeenCalledWith('favoriteGymName', 'Minha academia')
  })

  it('o badge reflete o estado do APP (academia salva + flag), não a permissão do iOS', () => {
    renderSection({ gymGeofenceEnabled: true, favoriteGymName: 'Smart Fit', favoriteGymLat: -25.4, favoriteGymLng: -49.2 })
    expect(screen.getByText(/Ativo/i)).toBeTruthy()
  })

  it('flag ligada mas SEM coordenadas continua desativado — não há o que monitorar', () => {
    renderSection({ gymGeofenceEnabled: true, favoriteGymName: 'Smart Fit', favoriteGymLat: null, favoriteGymLng: null })
    expect(screen.getByText('Desativado')).toBeTruthy()
  })
})

describe('source-guard: o placeholder não pode voltar a parecer valor', () => {
  const src = readFileSync('src/components/settings/SettingsSections.tsx', 'utf8')
  const block = src.slice(src.indexOf('SettingsGymGeofenceSection'), src.indexOf('export function SettingsModulesModal'))

  it('o fallback silencioso de nome não existe mais', () => {
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    expect(code).not.toMatch(/nameDraft\s*\|\|\s*'Minha academia'/)
  })

  it('o placeholder se anuncia como exemplo', () => {
    const placeholder = block.match(/placeholder="([^"]*)"/)?.[1] ?? ''
    expect(placeholder).toMatch(/^Ex\.:/)
  })

  it('o placeholder é mais apagado que o texto digitado', () => {
    // neutral-400 é o tom dos RÓTULOS — era por isso que o placeholder passava
    // por conteúdo real. Tem que ser visivelmente mais fraco que text-neutral-200.
    expect(block).toMatch(/placeholder:text-neutral-600/)
    expect(block).not.toMatch(/placeholder:text-neutral-400/)
  })
})
