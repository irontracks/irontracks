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

/**
 * ⚠️ O disparo automático NÃO funciona no iPhone — medido no aparelho em
 * 16/08/2026. O WKWebView só abre o seletor de arquivo com ativação transitória
 * do usuário, e ela já expirou quando o efeito roda (o composer é `dynamic()`:
 * entre o toque e o mount há o carregamento do chunk). Quem garante a foto lá é
 * o CTA dourado, cujo clique é gesto de verdade — provado no aparelho: o
 * seletor "Photo Library / Choose File" abre.
 *
 * ⚠️ NÃO recriar um convite DENTRO da prévia. Foi tentado e removido em duas
 * rodadas: os handlers de pinça/arrasto dão `preventDefault` e cancelam o
 * clique do label (não abria nada), e depois de corrigido isso ele cobria o
 * desenho — no centro tapava o "MÉDIA POR DIA", mais acima tapava a marca.
 * A prévia é o RESULTADO; controle fica fora dela.
 */
describe('o CTA de mídia é a ação da tela quando não há foto', () => {
  it('sem mídia, o botão é dourado e maior', () => {
    expect(src).toMatch(/h-14 bg-yellow-500 text-black/)
  })

  it('com mídia, ele volta a ser discreto — dourado competiria com publicar', () => {
    expect(src).toMatch(/backgroundImage \|\| isVideo\s*\n?\s*\?\s*'h-12 bg-neutral-900/)
  })

  it('o texto pede a foto', () => {
    expect(src).toMatch(/PONHA SUA FOTO OU VÍDEO/)
  })

  it('nada de convite sobreposto à prévia', () => {
    expect(src, 'a prévia é o resultado; controle fica fora dela')
      .not.toMatch(/Toque para pôr sua foto/)
  })
})

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
