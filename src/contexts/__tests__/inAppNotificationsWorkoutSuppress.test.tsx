import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// pathname controlável por teste
let mockPathname = '/dashboard'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
}))
// evita supabase real + realtime bridge no jsdom
vi.mock('@/utils/supabase/client', () => ({ createClient: () => null }))
vi.mock('@/components/RealtimeNotificationBridge', () => ({ default: () => null }))
vi.mock('@/hooks/useUserSettings', () => ({ useUserSettings: () => ({ settings: {} }) }))

import { InAppNotificationsProvider, useInAppNotifications } from '../InAppNotificationsContext'

// Consumer que expõe o notify pra dentro do teste
let notifyFn: (p: Record<string, unknown>) => void = () => {}
function Grabber() {
  const { notify } = useInAppNotifications()
  notifyFn = notify
  return null
}

const renderProvider = () =>
  render(
    <InAppNotificationsProvider userId="" settings={{}} disableRealtime>
      <Grabber />
    </InAppNotificationsProvider>,
  )

describe('InApp toasts — foco no treino (suprime social durante treino ativo)', () => {
  beforeEach(() => {
    mockPathname = '/dashboard'
    notifyFn = () => {}
  })

  it('mostra toast social no dashboard normal', () => {
    renderProvider()
    act(() => notifyFn({ type: 'social', text: 'Fran bateu PR', senderName: 'Fran' }))
    expect(screen.getByText('Fran bateu PR')).toBeInTheDocument()
  })

  it('SUPRIME toast social durante treino ativo (/dashboard/active)', () => {
    mockPathname = '/dashboard/active'
    renderProvider()
    act(() => notifyFn({ type: 'social', text: 'Fran bateu PR', senderName: 'Fran' }))
    expect(screen.queryByText('Fran bateu PR')).not.toBeInTheDocument()
  })

  it('suprime também success/milestone (PR pode vir como success) no treino', () => {
    mockPathname = '/dashboard/active'
    renderProvider()
    act(() => notifyFn({ type: 'success', text: 'PR batido!', senderName: 'Fran' }))
    expect(screen.queryByText('PR batido!')).not.toBeInTheDocument()
  })

  it('MANTÉM erro durante treino ativo (problema funcional passa)', () => {
    mockPathname = '/dashboard/active'
    renderProvider()
    act(() => notifyFn({ type: 'error', text: 'Falha ao salvar série' }))
    expect(screen.getByText('Falha ao salvar série')).toBeInTheDocument()
  })
})
