/**
 * Cor de cabeçalho de seção não pode roubar sinal semântico.
 *
 * Configurações tinha 11 seções com 11 cores. Três roubavam significado:
 * Privacidade em `#ef4444` (a cor de ERRO do app), Treino em `#10b981` (verde
 * de sucesso — e nem o `#22c55e` da paleta) e Ferramentas em `#f43f5e`, que
 * não existe na paleta. Segurança usava `#14b8a6`, idem.
 *
 * As outras sete eram variações do mesmo âmbar, ou seja: a codificação por cor
 * não codificava. E não codificaria mesmo — numa lista vertical vê-se uma
 * seção por vez, sem comparação lado a lado, então matiz não distingue nada.
 * Quem distingue é o ícone e o rótulo.
 *
 * É o mesmo defeito que a paleta de macros já corrigiu: gastar vermelho em
 * decoração deixa o app sem vermelho para dizer "erro".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SECOES = join('src', 'components', 'settings', 'SettingsSections.tsx')

/** Reservados: só podem aparecer quando SIGNIFICAM o que significam. */
const SEMANTICOS: Record<string, string> = {
  '#ef4444': 'vermelho = erro / destrutivo',
  '#22c55e': 'verde = sucesso',
  '#10b981': 'verde (fora da paleta) = sucesso',
  '#f97316': 'laranja = alerta / macro gordura',
}

const cabecalhos = (src: string): string[] =>
  [...src.matchAll(/<SectionHeader\b[\s\S]{0,240}?\/>/g)].map((m) => m[0])

describe('Configurações — a cor da seção não carrega significado', () => {
  const src = readFileSync(SECOES, 'utf8')

  it('nenhum cabeçalho de seção define cor própria', () => {
    const comCor = cabecalhos(src)
      .filter((t) => /\bcolor=/.test(t))
      .map((t) => /label="([^"]+)"/.exec(t)?.[1] ?? '?')
    expect(
      comCor,
      'a distinção entre seções vem do ícone e do rótulo. Cor decorativa aqui ' +
        'gasta os pigmentos que precisam significar erro e sucesso em outro lugar.',
    ).toEqual([])
  })

  it('nenhuma cor semântica aparece no arquivo de seções', () => {
    const achados = Object.keys(SEMANTICOS).filter((hex) => src.toLowerCase().includes(hex))
    expect(
      achados.map((h) => `${h} (${SEMANTICOS[h]})`),
      'se a seção precisa MESMO de vermelho, ela está avisando de um risco — e aí ' +
        'o lugar é um aviso, não o cabeçalho.',
    ).toEqual([])
  })

  it('o parser lê a tag inteira do cabeçalho', () => {
    expect(cabecalhos(src).length).toBeGreaterThanOrEqual(11)
    expect(cabecalhos('<SectionHeader icon={X} label="A" />')[0]).toContain('label="A"')
  })
})
