/**
 * Guards do preview da observação do exercício.
 *
 * A nota do coach quase sempre abre repetindo o nome do exercício. Num preview
 * de duas linhas isso gasta metade do espaço reafirmando o título — e a
 * instrução que só a nota tem fica cortada.
 *
 * O corte é conservador de propósito: na dúvida, mantém. Abertura preservada
 * por engano custa meia linha; abertura removida por engano some com instrução.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripRedundantOpening,
  noteNeedsExpand,
  NOTE_PREVIEW_CHARS,
} from '../exerciseNotePreview'

// Texto real, copiado do card que motivou a mudança (ago/2026).
const NOTA_REAL =
  'Leg press horizontal, uma perna de cada vez para corrigir assimetrias. ' +
  'Pé um pouco alto e central na plataforma para puxar mais glúteo/posterior e ' +
  'diferenciar do Leg 45° do início do treino. Desça até ~90° de joelho com ' +
  'controle, sem descolar o quadril do encosto, e empurre pelo calcanhar sem ' +
  'travar o joelho no topo. Core firme; alterne as pernas sem descanso longo entre elas.'

describe('stripRedundantOpening', () => {
  it('corta a abertura que só repete o título — o caso real do screenshot', () => {
    const out = stripRedundantOpening(NOTA_REAL, 'Leg press horizontal unilateral')
    expect(out.startsWith('Pé um pouco alto')).toBe(true)
    expect(out).not.toContain('uma perna de cada vez para corrigir')
  })

  it('ignora acento e caixa ao comparar', () => {
    const out = stripRedundantOpening(
      'Remada CURVADA com barra. Puxe até o umbigo.',
      'Remada curvada',
    )
    expect(out).toBe('Puxe até o umbigo.')
  })

  it('mantém a abertura quando ela traz informação própria', () => {
    const nota = 'Use pegada supinada e cotovelos colados. Suba até a barra tocar o peito.'
    expect(stripRedundantOpening(nota, 'Puxada alta')).toBe(nota)
  })

  it('nunca devolve vazio quando a nota é só a frase redundante', () => {
    const nota = 'Leg press horizontal unilateral.'
    // Cortar aqui deixaria o preview em branco — pior que a repetição.
    expect(stripRedundantOpening(nota, 'Leg press horizontal unilateral')).toBe(nota)
  })

  it('nota sem ponto final passa intacta', () => {
    const nota = 'Cadência 3-1-1 e sem travar o joelho'
    expect(stripRedundantOpening(nota, 'Leg press')).toBe(nota)
  })

  it('palavras curtas do título não bastam para acusar repetição', () => {
    // "de"/"com" aparecem em qualquer frase; sozinhas não provam nada.
    const nota = 'Segure o pico da contração por um segundo. Desça devagar.'
    expect(stripRedundantOpening(nota, 'Rosca de pé com halter')).toBe(nota)
  })

  it('entrada vazia ou inválida não quebra', () => {
    expect(stripRedundantOpening('', 'Supino')).toBe('')
    expect(stripRedundantOpening(NOTA_REAL, '')).toBe(NOTA_REAL)
  })
})

describe('fiação no ExerciseCard', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'ExerciseCard.tsx'), 'utf8')

  it('a nota nasce RECOLHIDA — era o problema todo', () => {
    expect(src).toMatch(/const \[noteOpen, setNoteOpen\] = useState\(false\)/)
    expect(src).toMatch(/noteOpen \? '' : 'line-clamp-2'/)
  })

  it('o dourado saiu da nota — neste app ele significa ação', () => {
    // Recorta só o bloco da observação: o card inteiro usa dourado de propósito
    // (badge do número, ícone), e casar no arquivo todo daria falso positivo.
    const bloco = /\{observation \? \(([\s\S]*?)\) : null\}/.exec(src)?.[1] ?? ''
    expect(bloco).not.toBe('')
    expect(bloco).not.toMatch(/yellow-|amber-/)
  })

  it('ler a técnica não recolhe o exercício', () => {
    // O card inteiro é role="button"; sem stopPropagation o toque borbulha.
    const bloco = /\{observation \? \(([\s\S]*?)\) : null\}/.exec(src)?.[1] ?? ''
    expect(bloco).toMatch(/stopPropagation/)
    expect(bloco).toMatch(/aria-expanded=\{noteOpen\}/)
  })
})

describe('noteNeedsExpand', () => {
  it('nota curta não ganha botão — "ver mais" que não revela nada vira ruído', () => {
    expect(noteNeedsExpand('Cadência controlada.')).toBe(false)
  })

  it('nota longa ganha botão', () => {
    expect(noteNeedsExpand(NOTA_REAL)).toBe(true)
  })

  it('o corte é o limite declarado, não um número solto no componente', () => {
    expect(noteNeedsExpand('x'.repeat(NOTE_PREVIEW_CHARS))).toBe(false)
    expect(noteNeedsExpand('x'.repeat(NOTE_PREVIEW_CHARS + 1))).toBe(true)
  })
})
