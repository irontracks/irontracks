import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Acabamento do card "Adicionar refeição" — a superfície mais usada da aba
 * NUTRIÇÃO. Auditoria de design, ago/2026.
 *
 * Os três invariantes abaixo já foram quebrados uma vez cada, e o de emoji três
 * vezes (⚙ no botão METAS, ⚡ no heatmap, e aqui 📷 📚 💧 🍱 🤖 😴 🔥 🎬 🍽️).
 * Por isso viraram guard de ARQUIVO INTEIRO, não do trecho corrigido.
 *
 * O casamento é sempre contra o CÓDIGO EXECUTÁVEL: os comentários deste módulo
 * citam os emojis e as classes proibidas para explicar por que saíram, e um
 * guard ingênuo acusaria a própria documentação.
 */
const SRC = join(__dirname, '..', 'NutritionMixer.tsx')

/** Remove comentários de bloco e de linha — sobra o que roda. */
const executavel = (): string =>
  readFileSync(SRC, 'utf8')
    .replace(/\/\*[^]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

describe('ícones', () => {
  /**
   * Emoji é desenhado pela fonte do SISTEMA: o 📷 virava a câmera vintage marrom
   * da Apple no meio de uma paleta gold/dark, com peso e cor fora do controle do
   * app — e convivia com ícones lucide na mesma linha.
   */
  it('nenhum emoji no código executável — os ícones são lucide', () => {
    expect(executavel()).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u)
  })

  /** O tipo é a defesa real: com `icon: string` o próximo emoji entra sem atrito. */
  it('QuickAction aceita componente de ícone, não string', () => {
    const src = readFileSync(SRC, 'utf8')
    const assinatura = src.slice(src.indexOf('function QuickAction'), src.indexOf('function QuickAction') + 320)
    expect(assinatura).toMatch(/icon:\s*React\.ComponentType/)
    expect(assinatura).not.toMatch(/icon:\s*string/)
  })
})

describe('ação primária', () => {
  /**
   * O app inteiro usa `bg-yellow-500` sólido no CTA (TREINAR AGORA, VER PERFIL,
   * Salvar). Aqui era um gradiente que lia como marrom-oliva — bem mais escuro
   * que o amarelo da marca —, fazendo a ação mais importante do card parecer
   * desativada.
   */
  it('o botão Lançar usa o amarelo sólido do design system, não gradiente', () => {
    const src = executavel()
    const botao = src.slice(src.indexOf('onClick={handleSubmit}') - 200, src.indexOf('onClick={handleSubmit}') + 500)
    expect(botao).toContain('bg-yellow-500')
    expect(botao, 'gradiente escurece o CTA e o afasta do resto do app').not.toMatch(/bg-gradient-to-\w+\s+from-yellow/)
  })
})

describe('alvos de toque', () => {
  /**
   * 44pt é o mínimo da HIG e do WCAG 2.5.5. O card errava nos três botões
   * (h-9/h-10/size-9) num app que se usa com a mão suada no meio da série.
   */
  it('nenhum botão do card abaixo de 44px', () => {
    // Fronteiras por ÂNCORA DE CÓDIGO: o marcador de seção ("MEAL INPUT") vive
    // num comentário e some junto com eles.
    const src = executavel()
    const inicio = src.indexOf('aria-label="Adicionar refeição"')
    const fim = src.indexOf('{schemaMissing && (')
    expect(inicio, 'âncora inicial sumiu — o card foi reescrito').toBeGreaterThan(-1)
    expect(fim, 'âncora final sumiu — o card foi reescrito').toBeGreaterThan(inicio)
    const card = src.slice(inicio, fim)

    // Só as classes dos <button>: `size-4` de um SVG decorativo não é alvo de
    // toque, e medi-lo junto transformaria o guard em ruído.
    const alturas: number[] = []
    for (const trecho of card.split('<button').slice(1)) {
      const cls = trecho.match(/className=\{?[`"]([^`"]*)[`"]/)
      if (!cls) continue
      for (const m of cls[1].matchAll(/\b(?:h|size)-(\d+(?:\.\d+)?)\b/g)) {
        alturas.push(parseFloat(m[1]) * 4)
      }
    }
    expect(alturas.length, 'nenhum botão encontrado — o seletor quebrou').toBeGreaterThan(0)
    const pequenos = alturas.filter((px) => px < 44)
    expect(pequenos, `alvos abaixo de 44px: ${pequenos.join(', ')}`).toHaveLength(0)
  })
})

describe('instrução do campo', () => {
  /**
   * O exemplo que ENSINA o parser ficava numa linha de ajuda dois campos acima,
   * enquanto o placeholder do campo ("O que você comeu?") não ensinava formato
   * nenhum. Trocados de lugar: a instrução mora onde se digita.
   */
  it('o exemplo de formato é o placeholder do campo de refeição', () => {
    const src = executavel()
    expect(src).toMatch(/placeholder=\{schemaMissing \? 'Nutrição não configurada\.' : 'Ex\.: 150g frango/)
    // E não sobrou duplicado como linha de ajuda solta.
    expect(src).not.toMatch(/>Ex\.: 150g frango[^<]*<\/div>/)
  })
})
