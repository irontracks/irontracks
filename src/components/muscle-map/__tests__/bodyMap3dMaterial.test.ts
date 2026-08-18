import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A primeira versão do mapa 3D pintava a cor do volume como ALBEDO sólido do
 * material. O dono reprovou em uma frase: "está muito feio as cores".
 *
 * O erro era conceitual. Em 2D a cor é um véu translúcido sobre uma textura que
 * já tem sombra; jogar a mesma cor como base de um material liso sob luz difusa
 * é a definição física de plástico pintado. A correção usa DOIS canais — tinta
 * no albedo (preserva o sombreamento) e emissão (faz acender) — mais tone
 * mapping, sem o qual laranja e vermelho saturados estouram sem rolloff.
 *
 * Este guard trava a CLASSE do problema, não a instância: qualquer volta ao
 * albedo sólido, ou a perda do tone mapping, reprova aqui.
 */

const FILE = path.join(process.cwd(), 'src/components/muscle-map/BodyMap3D.tsx')

/** Código executável: fora de comentário e de string. */
function executableCode(src: string): string {
  let out = ''
  let i = 0
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code'
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue }
      if (two === '/*') { mode = 'block'; i += 2; continue }
      if (src[i] === "'") { mode = 'sq'; i++; continue }
      if (src[i] === '"') { mode = 'dq'; i++; continue }
      if (src[i] === '`') { mode = 'tpl'; i++; continue }
      out += src[i]; i++; continue
    }
    if (mode === 'line' && src[i] === '\n') { mode = 'code'; out += '\n' }
    else if (mode === 'block' && two === '*/') { mode = 'code'; i++ }
    else if (mode === 'sq' && src[i] === "'" && src[i - 1] !== '\\') mode = 'code'
    else if (mode === 'dq' && src[i] === '"' && src[i - 1] !== '\\') mode = 'code'
    else if (mode === 'tpl' && src[i] === '`' && src[i - 1] !== '\\') mode = 'code'
    i++
  }
  return out
}

const code = executableCode(fs.readFileSync(FILE, 'utf8'))

describe('material do mapa muscular 3D', () => {
  it('acende o músculo por EMISSÃO, não só por tinta', () => {
    expect(code).toMatch(/emissiveIntensity\s*=/)
    expect(code).toMatch(/mat\.emissive\.(set|copy)\(/)
  })

  it('mistura a cor no albedo em vez de substituí-lo — é o que mantém o relevo', () => {
    // `lerp` preserva o sombreamento; `mat.color.set(corDoVolume)` é o plástico
    // que o dono reprovou.
    expect(code).toMatch(/mat\.color\.lerp\(/)
  })

  it('a base do corpo é a MESMA para todo grupo — o corpo é um corpo só', () => {
    expect(code).toMatch(/mat\.color\.setHex\(BODY_COLOR\)/)
  })

  it('usa tone mapping — sem rolloff o laranja satura e vira plástico', () => {
    expect(code).toMatch(/toneMapping\s*=\s*THREE\.ACESFilmicToneMapping/)
  })

  it('a base do manequim é warm black, como todo o resto do app', () => {
    // Os fundos do app são #0f0f0e / #151514 / #1a1a18. Um cinza azulado
    // (azul > vermelho) destoa de toda a paleta — foi o primeiro erro de craft.
    const hex = code.match(/const BODY_COLOR = 0x([0-9a-f]{6})/i)?.[1]
    expect(hex).toBeTruthy()
    const r = parseInt(hex!.slice(0, 2), 16)
    const b = parseInt(hex!.slice(4, 6), 16)
    expect(r).toBeGreaterThanOrEqual(b)
  })

  it('hierarquia por subtração: os outros grupos recuam quando há seleção', () => {
    expect(code).toMatch(/DIMMED/)
    const dimmed = Number(code.match(/const DIMMED = ([\d.]+)/)?.[1])
    expect(dimmed).toBeGreaterThan(0)
    expect(dimmed).toBeLessThan(1)
  })

  it('o palco não é buraco preto dentro de um card elevado', () => {
    expect(code).not.toMatch(/bg-black/)
  })
})
