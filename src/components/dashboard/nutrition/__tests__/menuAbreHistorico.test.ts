/**
 * "Histórico de refeições" no menu do avatar precisa funcionar com a aba de
 * nutrição JÁ ABERTA.
 *
 * O bug (relatado no iPhone em 25/08/2026: "clico e não aparece nada"): o
 * `historyOpen` nascia de `useState(Boolean(openHistoryOnMount))`, e valor
 * inicial só vale na PRIMEIRA montagem. Com a aba já aberta o `NutritionMixer`
 * não remonta — o item do menu virava botão morto.
 *
 * A suspeita inicial do dono era z-index ("abre por baixo da aba"), e estava
 * errada: o modal nunca chegava a ser pedido. Vale registrar porque a próxima
 * pessoa vai suspeitar da mesma coisa.
 *
 * Guard de SOURCE: montar o `NutritionMixer` exige Supabase, imports dinâmicos
 * e ~20 props, e um teste de render aqui mediria o harness, não o app. O
 * comportamento foi provado NO APARELHO — com a aba aberta, o item do menu abre
 * o histórico. O que este arquivo trava é a CAUSA voltar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (rel: string) => {
  const bruto = readFileSync(join(process.cwd(), rel), 'utf8')
  // Fora de comentário: senão o guard casa com a prosa que o explica.
  return bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const mixer = ler('src/components/dashboard/nutrition/NutritionMixer.tsx')
const overlay = ler('src/components/dashboard/nutrition/NutritionOverlay.tsx')
const shell = ler('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx')

describe('menu do avatar → histórico de refeições', () => {
  it('a abertura REAGE à prop, não só ao nascimento do componente', () => {
    // `useState(Boolean(openHistoryOnMount))` sozinho é o bug: sem um efeito
    // que observe a prop, a aba já montada ignora o pedido.
    const efeito = /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,400}?openHistoryOnMount[\s\S]{0,400}?\}\s*,\s*\[[^\]]*openHistoryOnMount[^\]]*\]\)/
    expect(mixer, 'com a aba de nutrição aberta o Mixer não remonta — o valor inicial do useState nunca é reavaliado')
      .toMatch(efeito)
  })

  it('o pedido é CONSUMIDO, senão o segundo clique não faz nada', () => {
    // A flag ficaria presa em `true`; o efeito só dispara na TROCA de valor.
    expect(mixer).toMatch(/onHistoryOpened\?\.\(\)/)
    expect(shell).toMatch(/onHistoryOpened=\{\(\)\s*=>\s*setNutritionHistoryOnOpen\(false\)\}/)
  })

  it('o overlay repassa o aviso — sem isso o ciclo morre no meio', () => {
    expect(overlay).toMatch(/onHistoryOpened=\{onHistoryOpened\}/)
  })
})
