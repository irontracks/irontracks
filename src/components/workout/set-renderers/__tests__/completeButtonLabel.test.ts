import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard do rótulo do botão de concluir série.
 *
 * Reportado pelo dono: no treino ativo, cada método dizia uma coisa — "Concluir"
 * na maioria, "OK" na série comum (a mais usada!) e só um "✓" sem texto no
 * drop-set. Padronizado em **Concluir** (pendente) / **Feito** (concluído).
 *
 * Este guard existe porque são 14 arquivos irmãos: quem criar o 15º método vai
 * copiar um vizinho, e basta copiar o errado pra divergência voltar.
 */
const DIR = 'src/components/workout/set-renderers'

const rendererFiles = readdirSync(join(process.cwd(), DIR))
  .filter((f) => f.endsWith('Set.tsx'))
  .sort()

const sourceOf = (file: string) => readFileSync(join(process.cwd(), DIR, file), 'utf8')

describe('rótulo do botão de concluir série', () => {
  it('existe um conjunto de renderers pra checar (o glob não pode silenciar)', () => {
    expect(rendererFiles.length).toBeGreaterThanOrEqual(14)
  })

  it.each(rendererFiles)('%s usa "Concluir" e não "OK"', (file) => {
    const src = sourceOf(file)
    // Rótulo visível "OK" — o texto entre tags ou como string literal solta.
    expect(src).not.toMatch(/>\s*OK\s*</)
    expect(src).not.toMatch(/['"`]OK['"`]/)
  })

  it.each(rendererFiles)('%s não usa "✓" como rótulo do botão', (file) => {
    const src = sourceOf(file)
    // O ✓ decorativo (badge de lado concluído) é permitido; o proibido é ele
    // fazer as vezes de TEXTO do botão — foi o caso do drop-set e do unilateral.
    expect(src).not.toMatch(/['"`]✓['"`]\s*[:}]/)
    expect(src).not.toMatch(/\$\{side\}\s*✓/)
  })

  it('todo renderer com botão de concluir diz "Concluir"', () => {
    const semConcluir = rendererFiles.filter((f) => {
      const src = sourceOf(f)
      const temBotaoDone = /handleToggleDone|handleComplete|onComplete/.test(src)
      return temBotaoDone && !src.includes('Concluir')
    })
    expect(semConcluir).toEqual([])
  })

  it('o estado concluído diz "Feito" (e não outro sinônimo)', () => {
    for (const file of rendererFiles) {
      const src = sourceOf(file)
      if (!/handleToggleDone|handleComplete|onComplete/.test(src)) continue
      expect(src).not.toMatch(/['"`]Concluído['"`]/)
      expect(src).not.toMatch(/['"`]Pronto['"`]/)
    }
  })
})
