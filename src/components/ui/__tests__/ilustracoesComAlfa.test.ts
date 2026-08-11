/**
 * Guard: ilustração de estado vazio precisa ter canal alfa.
 *
 * Achado da auditoria de 11/08/2026, no aparelho: os quatro PNGs de
 * `public/illustrations/` foram exportados SEM transparência, com fundo entre
 * (23,23,23) e (28,28,28) — sobre um app que é (10,10,10). O resultado é um
 * retângulo cinza flutuando no meio da tela, em quatro lugares diferentes
 * (treinos vazios, histórico vazio, comunidade vazia e a tela de erro).
 *
 * Em três dos quatro o fundo nem era uniforme, então a borda do retângulo
 * ficava ainda mais aparente.
 *
 * O defeito é invisível no código — nenhum `className` errado, nenhuma review
 * de PR pegaria. Só aparece na tela, e só se alguém abrir a tela certa. Por
 * isso o guard olha o ARQUIVO.
 *
 * Como ler um PNG sem dependência: o cabeçalho IHDR começa no byte 8 e o campo
 * `color type` fica no offset 25. Valores com alfa: 6 (RGBA) e 4 (cinza+alfa).
 * O tipo 3 (paleta) só tem transparência com um chunk tRNS, então é checado à
 * parte.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', '..', '..', '..', 'public', 'illustrations')
const COLOR_TYPE_OFFSET = 25

const arquivos = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.png'))

describe('ilustrações de estado vazio', () => {
  it('o diretório não está vazio — guard sem alvo não protege nada', () => {
    expect(arquivos.length).toBeGreaterThan(0)
  })

  it.each(arquivos)('%s tem canal alfa', (nome) => {
    const buf = readFileSync(join(DIR, nome))

    // Assinatura PNG, para o guard não passar verde num arquivo que não é PNG.
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')

    const colorType = buf[COLOR_TYPE_OFFSET]
    const temAlfaDireto = colorType === 6 || colorType === 4
    const paletaComTrns = colorType === 3 && buf.includes(Buffer.from('tRNS', 'ascii'))

    expect(
      temAlfaDireto || paletaComTrns,
      `${nome} exportado sem transparência (color type ${colorType}). ` +
        'Sobre o fundo #0a0a0a isso vira um retângulo cinza visível na tela.',
    ).toBe(true)
  })
})
