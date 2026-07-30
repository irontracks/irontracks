/**
 * O deload precisa se explicar para quem nunca ouviu o termo.
 *
 * Queixa do dono (30/07): "como a pessoa leiga ou novo usuário vai saber usar o
 * deload sozinho?".
 *
 * O app já tinha o mecanismo certo — `HelpHint` + `HELP_TERMS`, usado pelos
 * métodos avançados de série. E o texto do deload já estava escrito em
 * `HELP_TERMS.deload`... e não era referenciado em lugar nenhum: nem no aviso do
 * card, nem no modal. O modal mostrava "peso base", "peso mínimo seguro" e
 * "redução (%)" assumindo que a pessoa já sabia o conceito.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HELP_TERMS } from '@/utils/help/terms'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const card = read('src/components/workout/ExerciseCard.tsx')
const modals = read('src/components/workout/Modals.tsx')

describe('o texto de ajuda do deload existe e é usável', () => {
  it('tem título, explicação e tooltip', () => {
    expect(HELP_TERMS.deload.title).toBeTruthy()
    expect(HELP_TERMS.deload.text.length).toBeGreaterThan(60)
    expect(HELP_TERMS.deload.tooltip).toBeTruthy()
  })

  it('explica o QUE é e QUANDO usar, não só o nome', () => {
    const t = HELP_TERMS.deload.text.toLowerCase()
    expect(t).toContain('redução')
    expect(t).toMatch(/fadiga|recuperar|overtraining/)
  })
})

describe('o aviso no card se explica', () => {
  it('liga o HelpHint do deload (antes o texto existia e não era usado)', () => {
    expect(card).toContain('HELP_TERMS.deload.title')
    expect(card).toContain('HELP_TERMS.deload.text')
  })

  it('a ajuda fica visível sem depender de hover (no celular não existe hover)', () => {
    expect(card).toMatch(/deloadAlert \?[\s\S]{0,900}forceVisible/)
  })

  it('diz o BENEFÍCIO, não só a ordem de reduzir', () => {
    // sem isso o aviso manda fazer algo contraintuitivo (treinar mais leve)
    expect(card).toMatch(/recuperar|destravar/)
  })

  it('evita o jargão como única pista — fala em "aliviar", não só "deload"', () => {
    expect(card).toMatch(/Aliviar \{Math\.round/)
  })
})

describe('o modal se explica', () => {
  it('liga o HelpHint do deload no cabeçalho', () => {
    expect(modals).toContain('HELP_TERMS.deload.title')
    expect(modals).toMatch(/HelpHint[\s\S]{0,200}forceVisible/)
  })

  it('tem uma linha em português simples abaixo do título', () => {
    expect(modals).toMatch(/Treinar mais leve por uma sessão/)
  })
})
