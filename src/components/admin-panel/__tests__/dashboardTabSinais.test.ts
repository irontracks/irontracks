/**
 * Painel de Controle / Área do Professor — auditoria de 13/08/2026.
 *
 * As duas telas compartilham o `DashboardTab`, então cada defeito aqui aparecia
 * duas vezes no menu.
 *
 * 1. SAUDAÇÃO. Começava por `user.name`, que costuma vir vazio, e caía no
 *    e-mail: a tela dizia "DJ MK Brasil" no cabeçalho e "Bom dia, djmkbrasil"
 *    dois centímetros abaixo. Handle técnico não é como alguém se chama, e o
 *    nome certo já estava à mão em `displayName` — o mesmo que o cabeçalho usa.
 *
 * 2. VERMELHO FIXO em "Pendentes". Com zero pendentes — que é a boa notícia —
 *    o card ficava vermelho igual. Cor de alarme sempre ligada não alarma
 *    ninguém: o vermelho tem que acender com a PENDÊNCIA, não com a categoria.
 *    Mesmo defeito do dourado no menu (#783) e da cor de seção (#784).
 *
 * 3. EIXO Y TRUNCADO. Num gráfico de BARRA o comprimento É o dado. Sem
 *    `beginAtZero`, o Chart.js escolhia a escala pelo intervalo dos valores e o
 *    eixo começava em 10: com 23 e 26 alunos, uma barra aparecia mais do que o
 *    dobro da outra. Distorção de leitura num painel de decisão.
 *
 * 4. LEGENDA FALSA. Um dataset ("Alunos") com um ARRAY de cores — uma por
 *    barra. O Chart.js desenha a legenda com a primeira cor, então ela afirmava
 *    "verde = Alunos" enquanto verde significa "Pago". Legenda que descreve
 *    errado é pior que legenda nenhuma; o eixo X já rotula cada barra.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join('src', 'components', 'admin-panel', 'DashboardTab.tsx'), 'utf8')
/** Só o executável — o guard não pode se satisfazer com o comentário que o explica. */
const codigo = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('DashboardTab — sinais que precisam significar', () => {
  it('a saudação usa o mesmo nome do cabeçalho, não o e-mail', () => {
    expect(codigo).toMatch(/user\?\.displayName\s*\?\?/)
  })

  it('o vermelho de Pendentes é condicionado à pendência', () => {
    expect(codigo).toMatch(/temPendentes/)
    // nenhum vermelho solto no card: as classes de alerta passam pela condição
    const cardPendentes = codigo.slice(codigo.indexOf('Pendentes') - 1200, codigo.indexOf('Pendentes') + 400)
    const vermelhosIncondicionais = cardPendentes.match(/(?<!\$\{[^}]{0,80})bg-red-500\/10(?![^`]*temPendentes)/g)
    expect(vermelhosIncondicionais, 'zero pendentes é boa notícia — não pinte de alarme').toBeNull()
  })

  it('gráfico de barra começa em zero', () => {
    expect(codigo, 'barra truncada mente sobre a proporção').toMatch(/beginAtZero:\s*true/)
  })

  it('a legenda não afirma uma cor para uma série multicolorida', () => {
    expect(codigo).toMatch(/legend:\s*\{\s*display:\s*false\s*\}/)
  })
})
