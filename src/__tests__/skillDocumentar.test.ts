/**
 * O protocolo do `/documentar` — o que impede o `CLAUDE.md` de virar imposto.
 *
 * O comando em si vive em `.claude/commands/`, que está no `.gitignore`: **este
 * guard não pode olhar para lá**, porque no CI aquele diretório não existe. O
 * que se trava aqui é o conteúdo versionado em `docs/`.
 *
 * As duas fases travadas abaixo nasceram de furos reais da primeira versão:
 *  - 3½ — a skill me deixou DOCUMENTAR uma armadilha que dava para ELIMINAR;
 *  - 5½ — a skill só sabia acrescentar, num arquivo que já tinha 2.505 linhas
 *    (184 KB) lidas em toda sessão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CAMINHO = join(process.cwd(), 'docs/skill-documentar.md')

describe('protocolo do /documentar', () => {
  it('está versionado em docs/ — em `.claude/` ele some no clone e não passa por PR', () => {
    expect(existsSync(CAMINHO)).toBe(true)
  })

  const doc = existsSync(CAMINHO) ? readFileSync(CAMINHO, 'utf8') : ''

  it('tem as sete fases, incluindo as duas que nasceram de furo', () => {
    for (const fase of ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 3½', 'Fase 4', 'Fase 5', 'Fase 5½', 'Fase 6', 'Fase 7']) {
      expect(doc, `${fase} sumiu do protocolo`).toContain(fase)
    }
  })

  /** Sem isto, a skill vira "documente a armadilha" — e a armadilha continua lá. */
  it('manda ELIMINAR a armadilha antes de escrevê-la', () => {
    expect(doc).toMatch(/Dá para fazer X deixar de acontecer/)
    expect(doc).toMatch(/vira folclore/)
  })

  /** Sem isto, toda execução engorda o arquivo que é lido em toda sessão. */
  it('tem orçamento: nota longa vai para docs/, e toda execução tenta podar', () => {
    expect(doc).toMatch(/lido INTEIRO em toda sessão/)
    expect(doc).toMatch(/docs\/<assunto>\.md/)
    expect(doc).toMatch(/tornou redundante e apague/)
  })

  it('separa regra de comportamento (global) de conhecimento do repo (projeto)', () => {
    expect(doc).toMatch(/~\/\.claude\/CLAUDE\.md/)
  })

  it('exige fonte para cada afirmação e rótulo para suspeita', () => {
    expect(doc).toMatch(/Número medido, nunca impressão/)
    expect(doc).toMatch(/Rotule o que não foi confirmado/)
  })
})
