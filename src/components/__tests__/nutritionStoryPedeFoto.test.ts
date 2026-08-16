import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * "Todos os modos têm que ser com foto" (dono, 16/08/2026).
 *
 * A mídia SEMPRE foi aceita nos três modos — o gate por `mode === 'meal'` caiu
 * há tempos (ver nutritionStoryMediaGate.test.ts). O que faltava era o fluxo:
 * quem abria via o card sobre o gradiente do template e um botão discreto no
 * meio do painel. Agora o seletor abre junto com a tela.
 *
 * Source-guard porque o efeito depende de `requestAnimationFrame` + `.click()`
 * num input real — em jsdom o clique não abre picker nenhum, então um teste de
 * comportamento diria "verde" sem provar nada.
 */
const src = readFileSync('src/components/NutritionStoryComposer.tsx', 'utf8')
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/**
 * O corpo do efeito, fatiado pela DECLARAÇÃO do ref até o fecho com as deps.
 * Fatiar por `const title` (que vive ACIMA no arquivo) devolveria string vazia
 * e os casos passariam sem olhar nada — o 2º jeito de escrever guard falso.
 */
const efeito = (() => {
  const ini = codigo.indexOf('const pediuMidiaRef')
  const fim = codigo.indexOf('[open, backgroundImage, isVideo, inputRef])', ini)
  expect(ini, 'o efeito precisa existir para ser auditado').toBeGreaterThan(-1)
  expect(fim, 'o fecho do efeito precisa ser encontrado').toBeGreaterThan(ini)
  return codigo.slice(ini, fim)
})()

describe('o story de nutrição nasce pedindo a foto', () => {
  it('clica no seletor de mídia ao abrir', () => {
    expect(codigo).toMatch(/inputRef\.current\?\.click\(\)/)
  })

  it('não é gateado por modo — vale para refeição, dia e período', () => {
    expect(efeito, 'o pedido do dono foi TODOS os modos').not.toMatch(/mode\s*===/)
  })

  it('pede uma vez só — cancelar o picker não pode reabrir em loop', () => {
    expect(codigo).toMatch(/if\s*\(\s*pediuMidiaRef\.current\s*\|\|/)
    expect(codigo).toMatch(/pediuMidiaRef\.current\s*=\s*true/)
  })

  it('não pede foto para quem já tem mídia', () => {
    expect(efeito).toMatch(/backgroundImage\s*\|\|\s*isVideo/)
  })

  it('falha em silêncio se o WebView recusar o clique programático', () => {
    // Sem gesto recente o iOS ignora `.click()`; um throw aqui derrubaria o
    // composer inteiro em vez de só não abrir o picker.
    expect(efeito).toMatch(/try\s*\{[^}]*click\(\)/)
    expect(efeito).toMatch(/catch/)
  })

  it('rearma ao fechar — a próxima abertura pede de novo', () => {
    expect(codigo).toMatch(/if\s*\(!open\)\s*\{\s*pediuMidiaRef\.current\s*=\s*false/)
  })
})
