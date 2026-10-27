import { describe, it, expect, afterEach } from 'vitest'
import { APP_ROOT_ID, portalRoot } from '@/utils/ui/portalRoot'

describe('portalRoot', () => {
  afterEach(() => { document.getElementById(APP_ROOT_ID)?.remove() })

  it('devolve o contêiner do app quando ele existe', () => {
    const raiz = document.createElement('div')
    raiz.id = APP_ROOT_ID
    document.body.appendChild(raiz)
    expect(portalRoot()).toBe(raiz)
  })

  it('cai no body fora do app (landing, testes)', () => {
    expect(portalRoot()).toBe(document.body)
  })
})
