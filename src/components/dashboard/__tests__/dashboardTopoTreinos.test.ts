/**
 * Guards da auditoria de design do topo da aba TREINOS (11/08/2026).
 *
 * O achado central: numa aba chamada TREINOS, o primeiro treino só aparecia no
 * rodapé da primeira tela. Medido no iPhone 17 Pro Max — cabeçalho + abas
 * (~190pt) + estado vazio de stories (~167pt) + três CTAs de criação (~220pt)
 * consumiam cerca de dois terços da altura antes do primeiro card.
 *
 * A causa não era uma decisão errada, e sim uma AUSÊNCIA: o `QuickStartCard`
 * ocupa o topo e resolve o caso comum, mas retornava `null` quando o usuário já
 * tinha treinado no dia. O espaço não era reatribuído — quem subia era o estado
 * vazio da barra de stories, por gravidade.
 *
 * São guards de SOURCE, não de render: o resultado na tela foi conferido no
 * simulador (ver o PR). jsdom não mede layout, então um teste de render aqui
 * provaria menos do que promete.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..')
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

/** Reduz ao código executável — sem isto o guard casa com o comentário que explica a regra. */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('o topo não fica órfão quando o usuário já treinou', () => {
  const src = read('QuickStartCard.tsx')

  it('trainedToday tem tratamento próprio, não cai no return null geral', () => {
    const code = codeOnly(src)
    // O antigo `if (hasActiveSession || trainedToday || !alvo) return null` é
    // exatamente o que não pode voltar: colapsa três casos distintos em nada.
    expect(code).not.toMatch(/hasActiveSession\s*\|\|\s*trainedToday/)
    expect(code).toMatch(/if \(trainedToday\)/)
  })

  it('mostra o estado de conclusão em vez de sumir', () => {
    expect(src).toMatch(/Treino concluído hoje/)
  })

  it('com treino EM ANDAMENTO o topo continua calado', () => {
    // A tela já está falando do treino; repetir no topo é ruído.
    expect(codeOnly(src)).toMatch(/if \(hasActiveSession\) return null/)
  })
})

describe('estado vazio de stories não ocupa o espaço de um card cheio', () => {
  const src = read('StoriesBar.tsx')
  const vazio = /ordered\.length === 0 && !loading && !error \? \(([\s\S]*?)\) : null/.exec(src)?.[1] ?? ''

  it('o bloco do estado vazio existe e foi encontrado pelo guard', () => {
    expect(vazio).not.toBe('')
  })

  it('não usa o dourado — ele é reservado para ação primária', () => {
    expect(vazio).not.toMatch(/yellow-/)
  })

  it('não volta a ser bloco alto e centralizado', () => {
    expect(vazio).not.toMatch(/text-center/)
    expect(vazio).not.toMatch(/py-5/)
  })

  it('continua acionável — reduzir peso não é remover a ação', () => {
    expect(vazio).toMatch(/setIsCreatorOpen\(true\)/)
  })
})

describe('card de treino — tipografia', () => {
  const src = read('WorkoutCard.tsx')
  const titulo = /<h3[^>]*>\{String\(w\?\.title/.exec(src)?.[0] ?? ''
  const meta = /<p className="text-\[11px\] text-neutral-400 font-mono[^"]*"/.exec(src)?.[0] ?? ''

  it('o título não força caixa alta (custa ~12% de largura)', () => {
    expect(titulo).not.toBe('')
    expect(titulo).not.toMatch(/uppercase/)
  })

  it('o título mantém a assinatura de peso do app', () => {
    expect(titulo).toMatch(/font-black/)
  })

  it('o título continua desviando do bloco de ações', () => {
    // Sem o padding ele passa por baixo dos botões de compartilhar/editar.
    expect(titulo).toMatch(/pr-40/)
  })

  it('a linha de meta NÃO reserva espaço para os botões — ela fica abaixo deles', () => {
    // Era o que deixava "10 exercícios · ~91 min ·" com o separador órfão.
    expect(meta).not.toBe('')
    expect(meta).not.toMatch(/pr-40/)
  })
})

describe('atalhos de criar treino recolhem quando já há treinos', () => {
  const src = read('StudentDashboard.tsx')
  const code = codeOnly(src)

  it('o botão fechado só existe para quem tem treinos', () => {
    expect(code).toMatch(/workouts\.length > 0 && !criarAberto/)
  })

  it('com a lista VAZIA os três seguem abertos — aí criar é a ação primária', () => {
    // Recolher no onboarding esconderia a única coisa que o usuário pode fazer.
    expect(code).toMatch(/workouts\.length === 0 \|\| criarAberto/)
  })

  it('o botão fechado não usa dourado sólido — criar deixou de ser primária', () => {
    const fechado = /onClick=\{\(\) => setCriarAberto\(true\)\}[\s\S]{0,400}?>/.exec(src)?.[0] ?? ''
    expect(fechado).not.toBe('')
    expect(fechado).toMatch(/bg-yellow-500\/\[0\.06\]/)
    // `bg-yellow-500` puro (sólido) é do CTA de iniciar treino.
    expect(fechado).not.toMatch(/bg-yellow-500["\s]/)
  })

  it('dá para recolher de volta', () => {
    expect(code).toMatch(/setCriarAberto\(false\)/)
  })
})

describe('Iron Rank — unidade separada do número', () => {
  // Blindando a CLASSE, não a instância: eu tinha corrigido só o "levantados" e
  // este guard pegou outras TRÊS ocorrências no mesmo arquivo — inclusive o
  // "próx. 500.000kg" logo abaixo, visível na mesma tela.
  it('nenhum número cola na unidade kg', () => {
    const src = read('IronRankCard.tsx')
    expect(src).toMatch(/&#8201;kg/)
    expect(src).not.toMatch(/toLocaleString\([^)]*\)\}kg/)
  })
})
