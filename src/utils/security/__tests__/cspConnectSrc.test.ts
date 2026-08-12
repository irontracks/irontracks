/**
 * `connect-src` da CSP — o que a primeira janela de relatórios ensinou.
 *
 * O CSP subiu em 11/08/2026 em `Report-Only` justamente porque uma política que
 * nunca rodou quebra terceiros em silêncio. A primeira janela (24 h, 16 eventos)
 * devolveu **duas** origens, as duas do próprio app e nenhuma delas no header:
 *
 * | origem | quem chama | o que quebraria em modo bloqueante |
 * |---|---|---|
 * | `api.cloudinary.com` | provedor de storage (`NEXT_PUBLIC_STORAGE_PROVIDER`) | TODO upload de imagem: avaliação corporal, avatar, story |
 * | `itunes.apple.com` | `useAppStoreUpdateCheck` | o aviso de "nova versão disponível" |
 *
 * Nenhuma das duas sairia de uma leitura de código — é o tipo de dependência que
 * só aparece quando o app roda no aparelho de gente de verdade. Ligar
 * `CSP_ENFORCE=true` antes dessa janela teria derrubado o upload de fotos.
 *
 * **Regra que fica:** origem nova entra aqui depois de aparecer nos relatórios E
 * de ser confirmada no código. Allowlist por suposição é buraco na política.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADERS = readFileSync(join(__dirname, '..', 'headers.ts'), 'utf8')
const CONNECT = /connect-src([^`]*)`/.exec(HEADERS)?.[1] ?? ''

describe('origens confirmadas pelos relatórios', () => {
  it('a diretiva foi encontrada — o guard não perdeu o alvo', () => {
    expect(CONNECT.length).toBeGreaterThan(50)
  })

  it('o provedor de storage está liberado', () => {
    // Sem isto, o modo bloqueante derruba upload de foto no app inteiro.
    expect(CONNECT).toContain('https://api.cloudinary.com')
  })

  it('o lookup da App Store está liberado', () => {
    expect(CONNECT).toContain('https://itunes.apple.com')
  })

  it('quem chama essas origens ainda existe no código', () => {
    // Allowlist não pode sobreviver ao consumidor: origem liberada sem chamador
    // é permissão de graça. Se um destes sumir, a entrada sai do header.
    const SRC = join(__dirname, '..', '..', '..')
    expect(readFileSync(join(SRC, 'hooks/useAppStoreUpdateCheck.ts'), 'utf8'))
      .toContain('itunes.apple.com')
    expect(readFileSync(join(SRC, 'app/layout.tsx'), 'utf8'))
      .toContain('api.cloudinary.com')
  })
})

describe('a política continua fechada onde importa', () => {
  it('connect-src não virou curinga', () => {
    // Um `*` solto aqui anula a diretiva inteira — e é o atalho tentador quando
    // aparece a terceira origem inesperada.
    expect(CONNECT).not.toMatch(/\s\*\s|'unsafe/)
  })

  it('o destino de relatório continua de pé', () => {
    // Enquanto o modo for Report-Only, sem `report-uri` a coleta é cega.
    expect(HEADERS).toMatch(/report-uri \$\{CSP_REPORT_PATH\}/)
  })
})
