import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/components/SettingsModal.tsx'), 'utf8')

describe('Apple Health — o "Conectado" tem que sobreviver ao fechar/reabrir (guard)', () => {
  it('healthKitGranted é DERIVADO do consentimento salvo, não um useState efêmero', () => {
    // Bug: `const [healthKitGranted, setHealthKitGranted] = useState(false)` — ao
    // reabrir as Configurações o badge voltava pra "Não conectado", mesmo com o
    // appleHealthSync salvo no banco e o sync funcionando.
    expect(src).not.toContain('setHealthKitGranted')
    expect(src).toContain('const healthKitGranted = Boolean(draft?.appleHealthSync)')
  })

  it('o consentimento é persistido no servidor E espelhado no draft', () => {
    expect(src).toContain('appleHealthSync: true')
    expect(src).toContain("setValue('appleHealthSync', true)")
  })

  it('o draft é ressincronizado com as settings salvas a cada abertura', () => {
    // O modal não desmonta ao fechar (`if (!isOpen) return null`), então o
    // `useState(() => base)` congelava o primeiro valor — inclusive o `{}` de
    // antes das settings carregarem.
    expect(src).toContain('if (isOpen && !wasOpenRef.current) setDraft(base)')
  })
})
