/**
 * Os dois tipos de notificação de medicamento — `medication_reminder` (cron) e
 * `medication_updated` (professor editou a lista) — nascem inteiros:
 *
 * - a Central os conhece (senão caem no sino cinza "Info", sem função);
 * - o toque os leva ao modal de medicamentos pelo TIPO (destino `medicamentos` em
 *   `lib/notifications/destinoDaNotificacao`), e NÃO por URL: a tela é um modal
 *   aberto pelo shell, não uma rota — um link inventado levaria para o lugar errado;
 * - o toggle `notifyMedications` existe nos DOIS lados (mapa de tipos e schema+UI).
 *
 * O caso de COMPORTAMENTO (`temDestino`/`destinoDaNotificacao`) vem antes do de
 * forma: um source-guard sozinho passaria verde com a tabela trocada por código morto.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import { temDestino } from '@/components/NotificationCenter'
import { destinoDaNotificacao } from '@/lib/notifications/destinoDaNotificacao'
import { NOTIFICATION_TYPE_TO_PREFERENCE } from '@/lib/social/notifyFollowers'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const central = ler('src/components/NotificationCenter.tsx')
const codigo = central.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

const TIPOS = ['medication_reminder', 'medication_updated'] as const

const bloco = (inicio: string, fim: string) => {
  const i = codigo.indexOf(inicio)
  return codigo.slice(i, codigo.indexOf(fim, i))
}

describe('Central de Notificações — tipos de medicamento', () => {
  it.each(TIPOS)('%s tem entrada no TYPE_CONFIG com função lembrete', (t) => {
    const cfg = bloco('const TYPE_CONFIG', '\n};')
    const m = new RegExp(`^\\s{4}${t}:\\s*tipo\\([^\\n]*?'([a-z]+)'\\),`, 'm').exec(cfg)
    expect(m, `${t} cairia no sino cinza "Info"`).not.toBeNull()
    expect(m?.[1]).toBe('lembrete')
    expect(cfg).toMatch(new RegExp(`${t}:\\s*tipo\\(<Pill`))
  })

  it.each(TIPOS)('%s leva ao modal pelo TIPO (card clicável)', (t) => {
    expect(temDestino({ type: t })).toBe(true)
    expect(destinoDaNotificacao({ type: t })).toEqual({ tipo: 'medicamentos' })
  })

  it.each(TIPOS)('%s abre o modal mesmo se o payload trouxer um link — a tela não é rota', (t) => {
    expect(destinoDaNotificacao({ type: t, link: '/dashboard' }), 'link aqui mandaria para outra tela').toEqual({
      tipo: 'medicamentos',
    })
  })
})

describe('toggle notifyMedications — dos dois lados', () => {
  const schema = ler('src/schemas/settings.ts')
  const ui = ler('src/components/settings/SettingsSections.tsx')

  it.each(TIPOS)('%s é gateado por notifyMedications', (t) => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE[t]).toBe('notifyMedications')
  })

  it('o toggle existe no schema E na tela', () => {
    expect(schema).toMatch(/notifyMedications:\s*z\.boolean\(\)\.default\(true\)/)
    expect(ui).toMatch(/setValue\('notifyMedications'/)
    expect(ui).toContain('title="Medicamentos"')
  })
})
